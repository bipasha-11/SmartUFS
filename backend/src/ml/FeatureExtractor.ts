/**
 * FeatureExtractor.ts
 * 
 * Extracts an 8-dimension feature vector from the current disk state and 
 * operation history to inform the ML strategy advisor.
 */

import { DiskManager } from '../managers/DiskManager';
import { BlockType } from '../core/Block';

export interface FeatureVector {
    fileSize: number;               // Requested file size in KB
    freeBlockRatio: number;          // Ratio of free blocks to total blocks
    externalFragmentation: number;   // Scatter of free space (0 = contiguous, 1 = scattered)
    internalFragmentation: number;   // Wasted space in last blocks of files
    avgSeekDistanceRecent: number;   // Average distance moved between operations (normalized)
    fileCreationRate: number;        // Frequency of creates in the sliding window
    deletionRate: number;            // Frequency of deletes in the sliding window
    diskUtilization: number;         // Ratio of used blocks to total blocks
}

export interface OpEntry {
    type: 'create' | 'delete' | 'read';
    timestamp: number;
    blockPosition: number;
}

/**
 * Computes external fragmentation using the formula:
 * 1 - (largestFreeContiguousRun / totalFreeBlocks)
 */
function computeExternalFragmentation(manager: DiskManager): number {
    const blocks = manager.disk.blocks;
    let totalFree = 0;
    let maxContiguous = 0;
    let currentRun = 0;

    for (const b of blocks) {
        if (b.type === BlockType.FREE) {
            totalFree++;
            currentRun++;
            if (currentRun > maxContiguous) maxContiguous = currentRun;
        } else {
            currentRun = 0;
        }
    }

    if (totalFree === 0) return 1.0;
    return 1.0 - (maxContiguous / totalFree);
}

/**
 * Computes internal fragmentation based on wasted bytes in the final block of each file.
 */
function computeInternalFragmentation(manager: DiskManager): number {
    const blockSize = manager.disk.config.blockSize;
    let totalWasted = 0;
    let totalAllocated = 0;

    for (const inode of manager.inodes) {
        if (inode === null) continue;
        const allocatedBytes = inode.blockCount * blockSize;
        const usedBytes = inode.size;
        totalWasted += Math.max(0, allocatedBytes - usedBytes);
        totalAllocated += allocatedBytes;
    }

    if (totalAllocated === 0) return 0.0;
    return Math.min(1.0, totalWasted / totalAllocated);
}

export class FeatureExtractor {
    private readonly WINDOW_SIZE = 50;
    private readonly SEEK_NORMALIZATION = 100;

    private opLog: OpEntry[] = [];
    private totalSeekDistance: number = 0;
    private totalOps: number = 0;
    private lastBlockPosition: number = 0;

    /**
     * Records an operation to calculate rates and seek distances.
     */
    public recordOperation(type: OpEntry['type'], blockPosition: number): void {
        const delta = Math.abs(blockPosition - this.lastBlockPosition);
        this.totalSeekDistance += delta;
        this.lastBlockPosition = blockPosition;
        this.totalOps++;

        this.opLog.push({ type, timestamp: Date.now(), blockPosition });
        if (this.opLog.length > this.WINDOW_SIZE) {
            this.opLog.shift();
        }
    }

    /**
     * Extracts the feature vector for the ML model.
     * @param manager The DiskManager providing disk and inode state.
     * @param requestedSize The size of the file to be created.
     */
    public extract(manager: DiskManager, requestedSize: number): FeatureVector {
        const totalBlocks = manager.disk.blocks.length;
        const freeCount = manager.disk.blocks.filter(b => b.type === BlockType.FREE).length;

        const currentWindow = Math.max(1, this.opLog.length);
        const creates = this.opLog.filter(o => o.type === 'create').length;
        const deletes = this.opLog.filter(o => o.type === 'delete').length;

        return {
            fileSize: requestedSize / 1024,
            freeBlockRatio: freeCount / totalBlocks,
            externalFragmentation: computeExternalFragmentation(manager),
            internalFragmentation: computeInternalFragmentation(manager),
            avgSeekDistanceRecent: this.totalOps > 0
                ? Math.min(1.0, (this.totalSeekDistance / this.totalOps) / this.SEEK_NORMALIZATION)
                : 0.0,
            fileCreationRate: creates / currentWindow,
            deletionRate: deletes / currentWindow,
            diskUtilization: (totalBlocks - freeCount) / totalBlocks
        };
    }

    public reset(): void {
        this.opLog = [];
        this.totalSeekDistance = 0;
        this.totalOps = 0;
        this.lastBlockPosition = 0;
    }
}
