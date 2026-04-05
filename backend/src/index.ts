import express from 'express';
import cors from 'cors';
import { DiskManager, STRATEGY_MAP } from './managers/DiskManager';
import { ContiguousAllocator, LinkedAllocator } from './strategies';
import { IndexedAllocator } from './strategies/IndexedAllocator';
import { Ext2Allocator } from './strategies/Ext2Allocator';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize with 100 blocks of 1KB each (Total 100KB)
const manager = new DiskManager({ diskSize: 1024 * 100, blockSize: 1024 });

// ─── Disk State ────────────────────────────────────────────────────────────────

app.get('/api/state', (req, res) => {
    res.json(manager.getState());
});

// ─── File Operations ────────────────────────────────────────────────────────────

app.post('/api/files', async (req, res) => {
    const { name, size } = req.body;
    if (!name || !size) return res.status(400).json({ error: 'Name and size required' });

    // createFile is now async (ML advisory path)
    const result = await manager.createFile(name, parseInt(size));
    res.json(result);
});

app.delete('/api/files/:name', (req, res) => {
    const result = manager.deleteFile(req.params.name);
    res.json(result);
});

app.post('/api/files/read', (req, res) => {
    const { name } = req.body;
    const result = manager.readFile(name);
    res.json(result);
});

// ─── Disk Operations ────────────────────────────────────────────────────────────

app.post('/api/format', (req, res) => {
    manager.format();
    res.json({ success: true });
});

// ─── Strategy Management ────────────────────────────────────────────────────────

app.post('/api/strategy', (req, res) => {
    const { strategy } = req.body;
    const factory = STRATEGY_MAP[strategy];
    if (!factory) {
        return res.status(400).json({
            error: `Unknown strategy: ${strategy}. Valid: ${Object.keys(STRATEGY_MAP).join(', ')}`
        });
    }
    manager.setStrategy(factory());
    res.json({ success: true, currentStrategy: manager.strategy.name });
});

// ─── ML Control ─────────────────────────────────────────────────────────────────

/**
 * POST /api/ml
 * Enable or disable the ML advisory layer.
 * Body: { enabled: boolean }
 */
app.post('/api/ml', (req, res) => {
    const { enabled } = req.body;
    manager.enableML(!!enabled);
    res.json({ success: true, mlEnabled: manager.mlEnabled });
});

/**
 * GET /api/ml/health
 * Check Python ML service status.
 */
app.get('/api/ml/health', async (req, res) => {
    const health = await manager.checkMLHealth();
    res.json(health);
});

/**
 * GET /api/ml/log
 * Return recent ML decisions for the frontend decision log panel.
 * Query param: ?n=20 (default 20)
 */
app.get('/api/ml/log', (req, res) => {
    const n = parseInt(req.query.n as string) || 20;
    const entries = manager.mlSelector.decisionLog.getLatest(n);
    res.json({ entries, stats: manager.mlSelector.decisionLog.getSummaryStats() });
});

/**
 * POST /api/ml/benchmark
 * Run a controlled benchmark: N file creation scenarios with and without ML.
 * Returns comparison table for the evaluation framework.
 * Body: { numOps: number } (default 50)
 */
app.post('/api/ml/benchmark', async (req, res) => {
    const { numOps = 50 } = req.body;

    // Phase A: Baseline — Static EXT2
    manager.format();
    manager.setStrategy(new Ext2Allocator());
    manager.enableML(false);

    const baselineResults = {
        successCount: 0,
        totalFrag: 0,
        totalSeek: 0,
        opCount: 0
    };

    for (let i = 0; i < numOps; i++) {
        const size = Math.floor(Math.random() * 10 + 1) * 1024; // 1–10KB
        const result = await manager.createFile(`bench_a_${i}`, size);
        if (result.success) {
            baselineResults.successCount++;
            const m = manager.metrics.getMetrics();
            baselineResults.totalFrag += m.fragmentationLevel;
            baselineResults.totalSeek += m.avgAccessTime;
        }
        baselineResults.opCount++;

        // Periodic deletes to create fragmentation
        if (i % 7 === 0 && manager.fileMap.size > 2) {
            const files = Array.from(manager.fileMap.keys());
            manager.deleteFile(files[0]);
        }
    }

    // Phase B: ML-Advised
    manager.format();
    manager.enableML(true);
    // Wait for ML health check
    await manager.checkMLHealth();

    const mlResults = {
        successCount: 0,
        totalFrag: 0,
        totalSeek: 0,
        opCount: 0
    };

    for (let i = 0; i < numOps; i++) {
        const size = Math.floor(Math.random() * 10 + 1) * 1024;
        const result = await manager.createFile(`bench_b_${i}`, size);
        if (result.success) {
            mlResults.successCount++;
            const m = manager.metrics.getMetrics();
            mlResults.totalFrag += m.fragmentationLevel;
            mlResults.totalSeek += m.avgAccessTime;
        }
        mlResults.opCount++;

        if (i % 7 === 0 && manager.fileMap.size > 2) {
            const files = Array.from(manager.fileMap.keys());
            manager.deleteFile(files[0]);
        }
    }

    // Compute summary
    const n_base = Math.max(1, baselineResults.successCount);
    const n_ml = Math.max(1, mlResults.successCount);

    const report = {
        baseline_ext2: {
            successRate: baselineResults.successCount / baselineResults.opCount,
            avgFragmentation: baselineResults.totalFrag / n_base,
            avgSeekDistance: baselineResults.totalSeek / n_base
        },
        ml_advised: {
            successRate: mlResults.successCount / mlResults.opCount,
            avgFragmentation: mlResults.totalFrag / n_ml,
            avgSeekDistance: mlResults.totalSeek / n_ml,
            mlStats: manager.mlSelector.decisionLog.getSummaryStats()
        }
    };

    // Reset disk after benchmark
    manager.format();
    manager.enableML(false);

    res.json({ success: true, numOps, report });
});

// ─── Start Server ────────────────────────────────────────────────────────────────

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   FS Simulator Backend — http://localhost:${PORT}       ║
║   ML Advisory Layer: READY (Python service: :5000)   ║
╚══════════════════════════════════════════════════════╝
    `);
});
