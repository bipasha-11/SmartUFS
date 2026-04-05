import { Disk } from '../core/Disk';
import { Inode } from '../core/Inode';

export interface AllocationResult {
    success: boolean;
    allocatedBlocks: number[]; // List of block IDs
    error?: string;
}

export interface IAllocationStrategy {
    name: string;
    description: string;

    // Allocate blocks for a file of given size (in bytes)
    // Returns list of block IDs
    allocate(disk: Disk, fileSize: number, inode: Inode): AllocationResult;

    // Free blocks associated with an inode
    deallocate(disk: Disk, inode: Inode): void;
}
