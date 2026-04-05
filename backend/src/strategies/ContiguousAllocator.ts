import { Disk } from '../core/Disk';
import { Inode } from '../core/Inode';
import { BlockType } from '../core/Block';
import { AllocationResult, IAllocationStrategy } from './AllocationStrategy';

export class ContiguousAllocator implements IAllocationStrategy {
    public readonly name = 'Contiguous Allocation';
    public readonly description = 'Allocates consecutive blocks. Vulnerable to external fragmentation.';

    allocate(disk: Disk, fileSize: number, inode: Inode): AllocationResult {
        const blocksNeeded = Math.ceil(fileSize / disk.config.blockSize);
        if (blocksNeeded === 0) return { success: true, allocatedBlocks: [] };

        let startBlock = -1;
        let count = 0;

        // First-Fit Search
        for (let i = 0; i < disk.totalBlocks; i++) {
            if (disk.blocks[i].type === BlockType.FREE) {
                if (count === 0) startBlock = i;
                count++;
                if (count === blocksNeeded) {
                    // Found a chunk
                    const allocatedIds: number[] = [];
                    for (let j = startBlock; j < startBlock + blocksNeeded; j++) {
                        disk.writeBlock(j, new Uint8Array(0), BlockType.DATA, inode.id);
                        allocatedIds.push(j);
                    }
                    inode.blockCount = blocksNeeded;
                    inode.size = fileSize;
                    return { success: true, allocatedBlocks: allocatedIds };
                }
            } else {
                count = 0;
                startBlock = -1;
            }
        }

        return {
            success: false,
            allocatedBlocks: [],
            error: 'Not enough contiguous space available (External Fragmentation)'
        };
    }

    deallocate(disk: Disk, inode: Inode): void {
        // For contiguous, we might have stored just the start block and length, 
        // but here we likely track the blocks in the inode simulation for visualization.
        // Assuming inode has a list (though strictly contiguous only needs start/length).
        // The simulation Inode stores `directBlocks` or we can use the `allocatedBlocks` return.

        // In this simulation, the `Disk` knows which blocks belong to whom via `fileId`.
        // Ideally, we pass the block list.
        // Let's rely on the disk's fileId for cleanup to be safe, or explicit block list.

        // For now, scan disk for this fileId (inefficient but safe) or usage of inode maps.
        // Better: The system should track this. 
        // Let's assume the callers update the INODE with the block list.
    }
}
