import { Disk, DiskConfig } from '../core/Disk';
import { Inode } from '../core/Inode';
import { IAllocationStrategy } from '../strategies/AllocationStrategy';
import { ContiguousAllocator } from '../strategies/ContiguousAllocator';
import { IndexedAllocator } from '../strategies/IndexedAllocator';
import { Ext2Allocator } from '../strategies/Ext2Allocator';
import { LinkedAllocator } from '../strategies/LinkedAllocator';
import { BlockType } from '../core/Block';
import { MetricsCollector } from '../ml/MetricsCollector';
import { MLStrategySelector } from '../ml/MLStrategySelector';
import { BlockType as BT } from '../core/Block';

// Re-export the strategy map for index.ts use
export const STRATEGY_MAP: Record<string, () => IAllocationStrategy> = {
    contiguous: () => new ContiguousAllocator(),
    linked: () => new LinkedAllocator(),
    indexed: () => new IndexedAllocator(),
    ext2: () => new Ext2Allocator(),
};

export class DiskManager {
    public disk: Disk;
    public inodes: (Inode | null)[];
    public strategy: IAllocationStrategy;
    public readonly maxInodes: number = 32;
    public fileMap: Map<string, number>;

    // Legacy metrics collector (kept for backward compat with existing API surface)
    public metrics: MetricsCollector;

    // ML Advisory Layer
    public mlEnabled: boolean = false;
    public mlSelector: MLStrategySelector;
    public lastMLPrediction: string | null = null;
    public lastMLConfidence: number = 0;

    constructor(config: DiskConfig) {
        this.disk = new Disk(config);
        this.inodes = new Array(this.maxInodes).fill(null);
        this.fileMap = new Map();
        this.strategy = new Ext2Allocator(); // Default to EXT2 (best general-purpose)
        this.metrics = new MetricsCollector(this);
        this.mlSelector = new MLStrategySelector();
    }

    setStrategy(strategy: IAllocationStrategy) {
        this.strategy = strategy;
    }

    format() {
        this.disk.format();
        this.inodes.fill(null);
        this.fileMap.clear();
        this.metrics = new MetricsCollector(this);
        this.mlSelector.reset();
        this.lastMLPrediction = null;
        this.lastMLConfidence = 0;
    }

    /**
     * createFile — Core file creation with optional ML advisory.
     * 
     * When ML is DISABLED (default):
     *   → Direct call to strategy.allocate() — unchanged behavior
     * 
     * When ML is ENABLED:
     *   1. Record 'create' op in ML feature extractor
     *   2. Extract 8-feature vector from current disk state
     *   3. Send async HTTP request to Python ML service (200ms timeout)
     *   4. If prediction arrives: temporarily switch strategy
     *   5. Execute allocation with recommended (or current) strategy
     *   6. Restore original strategy
     *   7. Log prediction + actual outcome to MLDecisionLog
     * 
     * The core OS allocation logic (strategy.allocate) is NEVER bypassed.
     */
    async createFile(name: string, size: number): Promise<{ success: boolean, error?: string, mlAdvice?: string }> {
        if (this.fileMap.has(name)) return { success: false, error: 'File exists' };

        const inodeId = this.inodes.findIndex(n => n === null);
        if (inodeId === -1) return { success: false, error: 'Inode table full' };

        // Legacy metrics record
        this.metrics.recordOperation('write', 0);

        // Pre-allocation metrics snapshot (for delta computation)
        const preMetrics = this.metrics.getMetrics();
        const preFragmentation = preMetrics.fragmentationLevel;
        const preAvgSeek = preMetrics.avgAccessTime;

        // --- ML ADVISORY PATH ---
        let activeStrategy = this.strategy;
        let mlAdviceName: string | undefined;
        let advisory: any = null;
        const mlStart = Date.now();

        if (this.mlEnabled) {
            try {
                this.mlSelector.recordOp('create', 0);
                advisory = await this.mlSelector.advise(this, size);

                if (!advisory.usedFallback) {
                    const recommended = advisory.recommended;
                    const recommendedStrategy = this.strategyFromName(recommended);
                    if (recommendedStrategy) {
                        activeStrategy = recommendedStrategy;
                        mlAdviceName = recommended;
                        this.lastMLPrediction = recommended;
                        this.lastMLConfidence = advisory.prediction?.confidence || 0;
                    }
                }
            } catch (e) {
                // Fail-safe: proceed with current strategy
                advisory = null;
            }
        }

        // --- CORE ALLOCATION (ALWAYS RUNS THROUGH STRATEGY INTERFACE) ---
        const inode = new Inode(inodeId);
        const result = activeStrategy.allocate(this.disk, size, inode);

        if (!result.success) {
            return { success: false, error: result.error };
        }

        inode.directBlocks = result.allocatedBlocks;
        this.inodes[inodeId] = inode;
        this.fileMap.set(name, inodeId);
        inode.size = size;

        // --- LOG ML OUTCOME ---
        if (this.mlEnabled && advisory && advisory.prediction) {
            const postMetrics = this.metrics.getMetrics();
            const postFrag = postMetrics.fragmentationLevel;
            const seekDelta = Math.abs(postMetrics.avgAccessTime - preAvgSeek);
            const mlOverhead = Date.now() - mlStart;
            const usedBlocks = this.disk.blocks.filter(b => b.type !== BlockType.FREE).length;
            const postUtilization = usedBlocks / this.disk.totalBlocks;

            this.mlSelector.logDecision(
                advisory,
                activeStrategy.name,
                true,
                postFrag,
                postUtilization,
                seekDelta,
                mlOverhead
            );
        }

        return { success: true, mlAdvice: mlAdviceName };
    }

    readFile(name: string): { success: boolean, data?: number[], error?: string } {
        const inodeId = this.fileMap.get(name);
        if (inodeId === undefined) return { success: false, error: 'File not found' };

        const inode = this.inodes[inodeId]!;
        const startBlock = inode.directBlocks.length > 0 ? inode.directBlocks[0] : 0;
        this.metrics.recordOperation('read', startBlock);
        if (this.mlEnabled) this.mlSelector.recordOp('read', startBlock);

        return { success: true, data: inode.directBlocks };
    }

    deleteFile(name: string): { success: boolean, error?: string } {
        const inodeId = this.fileMap.get(name);
        if (inodeId === undefined) return { success: false, error: 'File not found' };

        const inode = this.inodes[inodeId]!;
        if (this.mlEnabled) this.mlSelector.recordOp('delete', inode.directBlocks[0] || 0);

        if (this.strategy.deallocate) {
            this.strategy.deallocate(this.disk, inode);
        }

        inode.directBlocks.forEach(bid => {
            this.disk.setBlockType(bid, BlockType.FREE);
            this.disk.blocks[bid].fileId = null;
        });

        this.inodes[inodeId] = null;
        this.fileMap.delete(name);

        return { success: true };
    }

    enableML(enabled: boolean) {
        this.mlEnabled = enabled;
        if (!enabled) {
            this.lastMLPrediction = null;
            this.lastMLConfidence = 0;
        }
    }

    /**
     * Map strategy name string to an IAllocationStrategy instance.
     * Handles all naming variants used by the ML model.
     */
    private strategyFromName(name: string): IAllocationStrategy | null {
        const n = name.toLowerCase();
        if (n.includes('contiguous')) return new ContiguousAllocator();
        if (n.includes('linked')) return new LinkedAllocator();
        if (n.includes('indexed')) return new IndexedAllocator();
        if (n.includes('ext2')) return new Ext2Allocator();
        return null;
    }

    /**
     * Async health check for the ML service.
     * Called by the /api/ml/health endpoint.
     */
    async checkMLHealth() {
        return this.mlSelector.checkServiceHealth();
    }

    getState() {
        return {
            blocks: this.disk.blocks.map(b => ({ id: b.id, type: b.type, fileId: b.fileId })),
            inodes: this.inodes,
            config: this.disk.config,
            strategy: this.strategy.name,
            files: Array.from(this.fileMap.entries()).map(([name, id]) => ({ name, id })),
            metrics: this.metrics.getMetrics(),
            mlEnabled: this.mlEnabled,
            mlServiceAvailable: this.mlSelector.isServiceAvailable,
            lastMLPrediction: this.lastMLPrediction,
            lastMLConfidence: this.lastMLConfidence,
            mlStats: this.mlSelector.decisionLog.getSummaryStats()
        };
    }
}
