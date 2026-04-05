
import { Disk } from '../core/Disk';
import { Inode } from '../core/Inode';
import { IAllocationStrategy, AllocationResult } from './AllocationStrategy';
import { BlockType } from '../core/Block';

export class IndexedAllocator implements IAllocationStrategy {
    name = 'Indexed Allocation';
    description = 'Allocates an index block pointing to data blocks.';

    allocate(disk: Disk, fileSize: number, inode: Inode): AllocationResult {
        const blockSize = disk.config.blockSize;
        const requiredBlocks = Math.ceil(fileSize / blockSize);

        // Need requiredBlocks + 1 (for Index Block)
        // Ideally index block fits pointers. 1KB block, 4 bytes ptr -> 256 ptrs.
        // Assuming file fits in one index block for simplicity.

        const freeBlocks: number[] = [];
        for (let i = 0; i < disk.blocks.length; i++) {
            if (disk.blocks[i].type === BlockType.FREE) {
                freeBlocks.push(i);
            }
        }

        if (freeBlocks.length < requiredBlocks + 1) {
            return { success: false, allocatedBlocks: [], error: 'Not enough space' };
        }

        // Pick random blocks to simulate scattered indexed allocation
        // But for simplicity/performance in sim, just pick the first ones available 
        // that are NOT contiguous to differentiate from contiguous?
        // Let's just pick first available.

        const allocated = freeBlocks.slice(0, requiredBlocks + 1);

        // Mark them
        allocated.forEach(bid => {
            disk.setBlockType(bid, BlockType.DATA); // or INDEX
            disk.blocks[bid].fileId = inode.id;
        });

        // First block is index
        disk.setBlockType(allocated[0], BlockType.INDIRECT);

        return { success: true, allocatedBlocks: allocated };
    }

    deallocate(disk: Disk, inode: Inode): void {
        inode.directBlocks.forEach(bid => {
            disk.setBlockType(bid, BlockType.FREE);
            disk.blocks[bid].fileId = null;
        });
    }
}
