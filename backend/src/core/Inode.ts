export class Inode {
    public readonly id: number;
    public size: number; // File size in bytes
    public blockCount: number; // Sectors/blocks used
    public directBlocks: number[]; // Direct pointers
    public singleIndirect: number | null;
    public doubleIndirect: number | null;
    public tripleIndirect: number | null;
    public isDirectory: boolean;
    public created: Date;
    public modified: Date;

    constructor(id: number) {
        this.id = id;
        this.size = 0;
        this.blockCount = 0;
        this.directBlocks = [];
        this.singleIndirect = null;
        this.doubleIndirect = null;
        this.tripleIndirect = null;
        this.isDirectory = false;
        this.created = new Date();
        this.modified = new Date();
    }
}
