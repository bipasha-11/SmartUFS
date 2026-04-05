import { Disk } from '../core/Disk';
import { Inode } from '../core/Inode';
import { BlockType } from '../core/Block';
import { AllocationResult, IAllocationStrategy } from './AllocationStrategy';

export class LinkedAllocator implements IAllocationStrategy {
    public readonly name = 'Linked Allocation';
    public readonly description = 'Allocates any free blocks and links them. No external fragmentation.';

    allocate(disk: Disk, fileSize: number, inode: Inode): AllocationResult {
        const blocksNeeded = Math.ceil(fileSize / disk.config.blockSize);
        if (blocksNeeded === 0) return { success: true, allocatedBlocks: [] };

        const allocatedIds: number[] = [];

        // Find ANY free blocks
        for (let i = 0; i < disk.totalBlocks && allocatedIds.length < blocksNeeded; i++) {
            if (disk.blocks[i].type === BlockType.FREE) {
                allocatedIds.push(i);
            }
        }

        if (allocatedIds.length < blocksNeeded) {
            return {
                success: false,
                allocatedBlocks: [],
                error: 'Disk full (Internal allocation failure)' // Only fails if disk is truly full
            };
        }

        // Commit allocation
        allocatedIds.forEach(id => {
            disk.writeBlock(id, new Uint8Array(0), BlockType.DATA, inode.id);
        });

        inode.blockCount = blocksNeeded;
        inode.size = fileSize;

        return { success: true, allocatedBlocks: allocatedIds };
    }

    deallocate(disk: Disk, inode: Inode): void {
        // Cleanup handled by manager
    }
}
