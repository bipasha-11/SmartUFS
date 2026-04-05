import { Block, BlockType } from './Block';

export interface DiskConfig {
    diskSize: number; // Total bytes
    blockSize: number; // Bytes per block
}

export class Disk {
    public readonly config: DiskConfig;
    public blocks: Block[];
    public readonly totalBlocks: number;

    constructor(config: DiskConfig) {
        this.config = config;
        this.totalBlocks = Math.floor(config.diskSize / config.blockSize);
        this.blocks = [];
        this.initialize();
    }

    private initialize() {
        for (let i = 0; i < this.totalBlocks; i++) {
            this.blocks.push(new Block(i, this.config.blockSize));
        }
    }

    public readBlock(id: number): Block {
        if (id < 0 || id >= this.totalBlocks) {
            throw new Error(`Block access out of bounds: ${id}`);
        }
        return this.blocks[id];
    }

    public writeBlock(id: number, data: Uint8Array, type: BlockType = BlockType.DATA, fileId: number | null = null) {
        const block = this.readBlock(id);
        block.data.set(data.subarray(0, this.config.blockSize));
        block.type = type;
        if (fileId !== null) block.fileId = fileId;
    }

    public setBlockType(id: number, type: BlockType) {
        this.blocks[id].type = type;
    }

    public format() {
        this.blocks.forEach(b => b.reset());
    }
}
