export enum BlockType {
    FREE = 'FREE',
    DATA = 'DATA',
    INODE_TABLE = 'INODE_TABLE',
    BLOCK_BITMAP = 'BLOCK_BITMAP',
    INODE_BITMAP = 'INODE_BITMAP',
    SUPERBLOCK = 'SUPERBLOCK',
    INDIRECT = 'INDIRECT'
}

export class Block {
    public readonly id: number;
    public readonly size: number;
    public type: BlockType;
    public data: Uint8Array;
    public fileId: number | null; // For visualization: which file owns this?

    constructor(id: number, size: number) {
        this.id = id;
        this.size = size;
        this.type = BlockType.FREE;
        this.data = new Uint8Array(size);
        this.fileId = null;
    }

    reset() {
        this.type = BlockType.FREE;
        this.fileId = null;
        this.data.fill(0);
    }
}
