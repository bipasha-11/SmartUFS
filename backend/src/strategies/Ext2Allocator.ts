
import { Disk } from '../core/Disk';
import { Inode } from '../core/Inode';
import { IAllocationStrategy, AllocationResult } from './AllocationStrategy';
import { BlockType } from '../core/Block';

export class Ext2Allocator implements IAllocationStrategy {
    name = 'EXT2-like Allocation';
    description = 'Uses block groups and bitmaps (simulated).';

    allocate(disk: Disk, fileSize: number, inode: Inode): AllocationResult {
        const blockSize = disk.config.blockSize;
        const requiredBlocks = Math.ceil(fileSize / blockSize);

        // Ext2 tries to allocate in the same block group as the parent (directory) 
        // or a new group for new directory.
        // Here we just simulate "Preallocation" or "Best Fit" or "Locality".
        // Let's implement a "Find a group of free blocks" approach.
        // Or finding a run of blocks even if not perfectly contiguous, to minimize fragmentation.

        const freeBlocks: number[] = [];
        /* 
           Simple Heuristic: 
           Scan for a window of 'requiredBlocks' with few used blocks?
           Or just use the standard bitmap scan but try to keep them close.
        */

        let allocated: number[] = [];

        // Try to find a contiguous chunk first (best for ext2)
        // If not, find closest available blocks

        let startBlock = -1;
        // Simple search for contiguous
        let currentRun = 0;
        for (let i = 0; i < disk.blocks.length; i++) {
            if (disk.blocks[i].type === BlockType.FREE) {
                if (currentRun === 0) startBlock = i;
                currentRun++;
                if (currentRun === requiredBlocks) {
                    // Found contiguous
                    for (let j = 0; j < requiredBlocks; j++) {
                        allocated.push(startBlock + j);
                    }
                    break;
                }
            } else {
                currentRun = 0;
                startBlock = -1;
            }
        }

        if (allocated.length === 0) {
            // Fallback to scattered (like Linked)
            for (let i = 0; i < disk.blocks.length; i++) {
                if (disk.blocks[i].type === BlockType.FREE) {
                    allocated.push(i);
                    if (allocated.length === requiredBlocks) break;
                }
            }
        }

        if (allocated.length < requiredBlocks) {
            return { success: false, allocatedBlocks: [], error: 'Not enough space' };
        }

        allocated.forEach(bid => {
            disk.setBlockType(bid, BlockType.DATA);
            disk.blocks[bid].fileId = inode.id;
        });

        return { success: true, allocatedBlocks: allocated };
    }

    deallocate(disk: Disk, inode: Inode): void {
        inode.directBlocks.forEach(bid => {
            disk.setBlockType(bid, BlockType.FREE);
            disk.blocks[bid].fileId = null;
        });
    }
}
