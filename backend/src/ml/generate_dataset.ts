
import * as fs from 'fs';
import * as path from 'path';
import { DiskManager } from '../managers/DiskManager';
import { ContiguousAllocator } from '../strategies/ContiguousAllocator';
import { LinkedAllocator } from '../strategies/LinkedAllocator';
import { IndexedAllocator } from '../strategies/IndexedAllocator';
import { Ext2Allocator } from '../strategies/Ext2Allocator';
import { SystemMetrics } from './MetricsCollector';

// Strategies to test
const strategies = [
    new ContiguousAllocator(),
    new LinkedAllocator(),
    new IndexedAllocator(),
    new Ext2Allocator()
];

const OUTPUT_FILE = path.join(__dirname, 'dataset.csv');

// Config
const NUM_SAMPLES = 500;
const DISK_SIZE_KB = 100;

function cloneState(manager: DiskManager) {
    // Deep clone disk state
    const diskData = new Uint8Array(manager.disk.blocks.length * manager.disk.config.blockSize);
    manager.disk.blocks.forEach((b, i) => {
        diskData.set(b.data, i * manager.disk.config.blockSize);
    });

    // We actually need to clone the JS objects, not just data.
    // Since DiskManager structure is simple, we can serialize/deserialize or just instantiate new and copy.
    // Easier: Instantiate new Manager, copy fields.

    // But copying internal state of Disk (blocks array) is tedious.
    // Let's use JSON serialization for deep clone (slow but works for 100KB disk sim).
    // Note: Uint8Array JSONifies to object, need to restore.
    return JSON.parse(JSON.stringify(manager.getState()));
}

function restoreState(manager: DiskManager, state: any) {
    // This is tricky because recreating class instances from JSON is hard.
    // Better Externalize the "Try Allocation" logic?
    // Actually, DiskManager.createFile just calls strategy.allocate.
    // We can simulate allocation on a "Shadow Disk".
    return; // Placeholder, we will use a different approach.
}

// Better Approach: 
// 1. Generate a Sequence of Operations.
// 2. Play the sequence.
// 3. At each "Create" op:
//    a. Fork 4 worlds.
//    b. Run the Op in each world.
//    c. Score worlds.
//    d. Pick winner.
//    e. Record Metrics of *current* world before Op.
//    f. Advance *current* world using Winner (to simulate optimal policy) or Random.

async function main() {
    console.log("Generating dataset...");

    const csvHeader = 'avgFileSize,readWriteRatio,accessFrequency,fragmentationLevel,avgAccessTime,throughput,bestStrategy\n';
    fs.writeFileSync(OUTPUT_FILE, csvHeader);

    const manager = new DiskManager({ diskSize: 1024 * DISK_SIZE_KB, blockSize: 1024 });

    for (let i = 0; i < NUM_SAMPLES; i++) {
        // Randomly reset sometimes to prevent full disk saturation
        if (i % 50 === 0) {
            manager.format();
        }

        // Decide Op: Create (70%), Delete (20%), Read (10%)
        const rand = Math.random();

        if (rand < 0.2) {
            // Delete random file
            const files = Array.from(manager.fileMap.keys());
            if (files.length > 0) {
                const f = files[Math.floor(Math.random() * files.length)];
                manager.deleteFile(f);
            }
        } else if (rand < 0.3) {
            // Read random file
            const files = Array.from(manager.fileMap.keys());
            if (files.length > 0) {
                const f = files[Math.floor(Math.random() * files.length)];
                manager.readFile(f);
            }
        } else {
            // Create File - This is where we label!
            const size = Math.floor(Math.random() * 1024 * 10) + 1024; // 1KB to 10KB
            const name = `file_${i}_${Date.now()}`;

            // 1. Capture Metrics BEFORE allocation
            const metrics = manager.metrics.getMetrics();

            // 2. Evaluate Strategies
            let bestStrat = '';
            let maxScore = -Infinity;

            // We need to test each strategy on the CURRENT state safely.
            // Since we can't easily fork, we will use the "Revert" strategy manually?
            // Or just instantiate temporary managers with same specific state?
            // "Hydrating" a manager from state is hard.

            // Hacky but effective for small state:
            // Save state *snapshot* as JSON
            const stateSnapshot = JSON.stringify(manager.getState());

            for (const strat of strategies) {
                // Restore state
                // This requires a "loadState" method on DiskManager.
                // Since we don't have it, we have to implement it or use a workaround.
                // Workaround: We can't easily restore. 

                // ALTERNATIVE: Don't modify the real manager. Create a CLONE.
                const clone = new DiskManager({ diskSize: 1024 * DISK_SIZE_KB, blockSize: 1024 });
                // Hydrate clone (Manual copy of blocks)
                // This is tedious to implement inside this script without access to private fields.
                // But DiskManager fields are public!

                // Copy Blocks
                manager.disk.blocks.forEach((b, idx) => {
                    clone.disk.blocks[idx].type = b.type;
                    clone.disk.blocks[idx].fileId = b.fileId;
                    // data copy not needed for allocation logic usually, just metadata
                });
                // Copy Inodes
                clone.inodes = JSON.parse(JSON.stringify(manager.inodes)); // Works for data objects
                // Copy FileMap
                clone.fileMap = new Map(manager.fileMap);

                // Set Strat
                clone.setStrategy(strat);

                // Run Op
                const result = clone.createFile(name, size);

                // Score
                let score = 0;
                if (!result.success) {
                    score = -1000;
                } else {
                    // Success!
                    // Metrics on the CLONE after allocation
                    const postMetrics = clone.metrics.getMetrics();

                    // Criteria: 
                    // 1. Successfully grew? (Yes)
                    // 2. Low Serialization/Fragmentation? 
                    // 3. Speed?

                    // Simple Score: 100 - Fragmentation - SeekTime
                    score = 100 - (postMetrics.fragmentationLevel * 100) - (postMetrics.avgAccessTime);

                    // Bonus for Contiguous if ContiguousAllocator (it's inherently faster for reads)
                    if (strat.name.includes('Contiguous')) score += 10;
                }

                if (score > maxScore) {
                    maxScore = score;
                    bestStrat = strat.name;
                }
            }

            // 3. Record Data
            const row = `${metrics.avgFileSize.toFixed(2)},${metrics.readWriteRatio.toFixed(2)},${metrics.accessFrequency.toFixed(2)},${metrics.fragmentationLevel.toFixed(2)},${metrics.avgAccessTime.toFixed(2)},${metrics.throughput.toFixed(2)},${bestStrat}\n`;
            fs.appendFileSync(OUTPUT_FILE, row);

            // 4. Advance Real World (Pick Best or Random)
            // Using Best strategy ensures we train on "Good Trajectories"
            const chosenStrat = strategies.find(s => s.name === bestStrat) || strategies[0];
            manager.setStrategy(chosenStrat);
            manager.createFile(name, size);
        }
    }

    console.log(`Dataset generated at ${OUTPUT_FILE}`);
}

main().catch(console.error);
