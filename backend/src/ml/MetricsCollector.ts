
import { DiskManager } from '../managers/DiskManager';
import { Disk } from '../core/Disk';
import { Inode } from '../core/Inode';

export interface SystemMetrics {
    avgFileSize: number;
    readWriteRatio: number;
    accessFrequency: number;
    fragmentationLevel: number;
    avgAccessTime: number; // Simulated
    throughput: number; // Simulated Ops/sec or Bytes/sec
}

export class MetricsCollector {
    private operationCount: number = 0;
    private readCount: number = 0;
    private writeCount: number = 0;
    private startTime: number;
    private totalSeekDistance: number = 0;
    private lastBlockAccessed: number = 0;

    constructor(private manager: DiskManager) {
        this.startTime = Date.now();
    }

    public recordOperation(type: 'read' | 'write', startBlock: number) {
        this.operationCount++;
        if (type === 'read') this.readCount++;
        else this.writeCount++;

        // Simulate seek distance
        const distance = Math.abs(startBlock - this.lastBlockAccessed);
        this.totalSeekDistance += distance;
        this.lastBlockAccessed = startBlock;
    }

    public getMetrics(): SystemMetrics {
        const inodes = this.manager.inodes.filter(i => i !== null) as Inode[];
        const totalSize = inodes.reduce((sum, i) => sum + (i.size || 0), 0);
        const avgFileSize = inodes.length > 0 ? totalSize / inodes.length : 0;

        const timeElapsed = (Date.now() - this.startTime) / 1000; // seconds
        const accessFrequency = timeElapsed > 0 ? this.operationCount / timeElapsed : 0;
        const throughput = timeElapsed > 0 ? (this.operationCount * 1024) / timeElapsed : 0; // Approx bytes/sec (assuming 1KB blocks/ops)

        const readWriteRatio = this.writeCount > 0 ? this.readCount / this.writeCount : this.readCount;

        // Fragmentation: Simplistic (1 - size of largest free hole / total free space)
        const freeBlocks = this.manager.disk.blocks.filter(b => b.fileId === null);
        const totalFree = freeBlocks.length;
        let maxContiguous = 0;
        let currentContiguous = 0;
        let lastId = -2;

        this.manager.disk.blocks.forEach(b => {
            if (b.fileId === null) {
                if (b.id === lastId + 1) {
                    currentContiguous++;
                } else {
                    currentContiguous = 1;
                }
                lastId = b.id;
                if (currentContiguous > maxContiguous) maxContiguous = currentContiguous;
            }
        });

        const fragmentationLevel = totalFree > 0 ? 1 - (maxContiguous / totalFree) : 0;

        // Avg Access Time (Simulated based on seek distance)
        const avgAccessTime = this.operationCount > 0 ? this.totalSeekDistance / this.operationCount : 0;

        return {
            avgFileSize,
            readWriteRatio,
            accessFrequency,
            fragmentationLevel,
            avgAccessTime,
            throughput
        };
    }
}
