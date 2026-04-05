import os
import csv
import math
import random
import copy
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple

# --- Configuration ---
TOTAL_BLOCKS = 100
BLOCK_SIZE = 1024
MAX_INODES = 32
NUM_SAMPLES = 1000
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), 'dataset.csv')
RANDOM_SEED = 42

random.seed(RANDOM_SEED)

@dataclass
class Block:
    id: int
    free: bool = True
    file_id: Optional[int] = None
    type: str = 'FREE'

@dataclass
class Inode:
    id: int
    size: int = 0
    block_count: int = 0
    direct_blocks: List[int] = field(default_factory=list)

class SimDisk:
    """Minimal disk simulation mirroring the TypeScript core logic."""
    def __init__(self):
        self.blocks = [Block(i) for i in range(TOTAL_BLOCKS)]
        self.inodes: List[Optional[Inode]] = [None] * MAX_INODES
        self.file_map: Dict[str, int] = {}
        self.op_log: List[Tuple[str, int]] = [] # (type, position)
        self.total_seek = 0
        self.op_count = 0
        self.last_pos = 0

    def clone(self) -> 'SimDisk':
        new_disk = SimDisk()
        new_disk.blocks = [copy.copy(b) for b in self.blocks]
        new_disk.inodes = [copy.deepcopy(n) for n in self.inodes]
        new_disk.file_map = dict(self.file_map)
        new_disk.op_log = list(self.op_log)
        new_disk.total_seek = self.total_seek
        new_disk.op_count = self.op_count
        new_disk.last_pos = self.last_pos
        return new_disk

    def record_op(self, op_type: str, pos: int):
        self.total_seek += abs(pos - self.last_pos)
        self.last_pos = pos
        self.op_count += 1
        self.op_log.append((op_type, pos))
        if len(self.op_log) > 50:
            self.op_log.pop(0)

# --- Metrics Helpers ---

def get_external_frag(disk: SimDisk) -> float:
    """Compute external fragmentation: 1 - (max_run / free_blocks)"""
    free_blocks: int = sum(1 for b in disk.blocks if b.free)
    if free_blocks == 0: return 0.0
    
    max_run: int = 0
    current_run: int = 0
    for b in disk.blocks:
        if b.free:
            current_run += 1
            max_run = max(max_run, current_run)
        else:
            current_run = 0
            
    return 1.0 - (max_run / free_blocks) if free_blocks > 0 else 0.0

def get_internal_frag(disk: SimDisk) -> float:
    """Compute internal fragmentation: total_wasted_bytes / total_allocated_bytes"""
    total_wasted: float = 0.0
    total_alloc: float = 0.0
    for n in disk.inodes:
        if n:
            alloc = n.block_count * BLOCK_SIZE
            total_wasted += max(0, alloc - n.size)
            total_alloc += alloc
    return total_wasted / total_alloc if total_alloc > 0 else 0.0

def get_avg_seek(disk: SimDisk) -> float:
    """Compute normalized average seek distance (0.0 to 1.0)"""
    if disk.op_count == 0: return 0.0
    return min(1.0, (disk.total_seek / disk.op_count) / float(TOTAL_BLOCKS))

# --- Allocation Strategies ---

def allocate_contiguous(disk: SimDisk, size: int, inode: Inode) -> bool:
    needed: int = math.ceil(size / BLOCK_SIZE)
    run_start: int = -1
    run_len: int = 0
    for i, b in enumerate(disk.blocks):
        if b.free:
            if run_len == 0: run_start = i
            run_len += 1
            if run_len == needed:
                for j in range(run_start, run_start + needed):
                    disk.blocks[j].free = False
                    disk.blocks[j].file_id = inode.id
                inode.direct_blocks = list(range(run_start, run_start + needed))
                inode.block_count = needed
                disk.record_op('create', run_start)
                return True
        else:
            run_start, run_len = -1, 0
    return False

def allocate_linked(disk: SimDisk, size: int, inode: Inode) -> bool:
    needed = math.ceil(size / BLOCK_SIZE)
    free_indices = [i for i, b in enumerate(disk.blocks) if b.free]
    if len(free_indices) < needed: return False
    chosen = free_indices[:needed]
    for idx in chosen:
        disk.blocks[idx].free = False
        disk.blocks[idx].file_id = inode.id
    inode.direct_blocks = chosen
    inode.block_count = needed
    disk.record_op('create', chosen[0])
    return True

def allocate_indexed(disk: SimDisk, size: int, inode: Inode) -> bool:
    needed = math.ceil(size / BLOCK_SIZE) + 1 # +1 for index block
    free_indices = [i for i, b in enumerate(disk.blocks) if b.free]
    if len(free_indices) < needed: return False
    chosen = free_indices[:needed]
    for idx in chosen:
        disk.blocks[idx].free = False
        disk.blocks[idx].file_id = inode.id
    inode.direct_blocks = chosen
    inode.block_count = needed
    disk.record_op('create', chosen[0])
    return True

def allocate_ext2(disk: SimDisk, size: int, inode: Inode) -> bool:
    if allocate_contiguous(disk, size, inode): return True
    return allocate_linked(disk, size, inode)

STRATEGIES = {
    'Contiguous': allocate_contiguous,
    'Linked':     allocate_linked,
    'Indexed':    allocate_indexed,
    'Ext2':       allocate_ext2
}

# --- Feature Extraction ---

def extract_features(disk: SimDisk, requested_size: int) -> Dict:
    free_blocks = sum(1 for b in disk.blocks if b.free)
    
    # External Fragmentation
    external_fragmentation = get_external_frag(disk)

    # Internal Fragmentation
    internal_fragmentation = get_internal_frag(disk)

    # Rates
    creates = sum(1 for op, _ in disk.op_log if op == 'create')
    deletes = sum(1 for op, _ in disk.op_log if op == 'delete')
    window = max(1, len(disk.op_log))

    return {
        'file_size': requested_size / 1024.0,
        'free_block_ratio': free_blocks / float(TOTAL_BLOCKS),
        'external_fragmentation': external_fragmentation,
        'internal_fragmentation': internal_fragmentation,
        'avg_seek_distance': get_avg_seek(disk),
        'creation_rate': creates / float(window),
        'deletion_rate': deletes / float(window),
        'disk_utilization': (TOTAL_BLOCKS - free_blocks) / float(TOTAL_BLOCKS)
    }

# --- Scoring ---

def score_strategy(disk: SimDisk, success: bool) -> float:
    """Weighted scoring based on fragmentation, seek distance, and success."""
    if not success: return -1000.0 # Heavy penalty for failure
    
    ext_frag = get_external_frag(disk)
    avg_seek = get_avg_seek(disk)
    
    # Weights: fragmentation 40%, seek distance 40%, success implicitly handled
    # Higher score is better
    score = 100.0 - (ext_frag * 40.0) - (avg_seek * 40.0)
    return score

# --- Workload Simulation ---

def run_simulation():
    if not os.path.exists(os.path.dirname(OUTPUT_FILE)):
        os.makedirs(os.path.dirname(OUTPUT_FILE))

    print(f"Generating dataset with {NUM_SAMPLES} samples...")
    disk = SimDisk()
    dataset = []

    for _ in range(NUM_SAMPLES):
        # 1. Randomly decide to delete a file to create fragmentation
        if disk.file_map and random.random() < 0.3:
            name = random.choice(list(disk.file_map.keys()))
            idx = disk.file_map.pop(name)
            inode = disk.inodes[idx]
            if inode:
                for b_id in inode.direct_blocks:
                    disk.blocks[b_id].free = True
                    disk.blocks[b_id].file_id = None
                disk.inodes[idx] = None
                pos = inode.direct_blocks[0] if inode.direct_blocks else 0
                disk.record_op('delete', pos)

        # 2. Pick a random request size
        req_size = random.randint(512, 8192)
        features = extract_features(disk, req_size)

        # 3. Test all strategies on clones
        best_name = None
        max_score = -float('inf')

        for name, func in STRATEGIES.items():
            clone = disk.clone()
            idx = next((i for i, n in enumerate(clone.inodes) if n is None), None)
            if idx is not None:
                inode = Inode(idx, size=req_size)
                success = func(clone, req_size, inode)
                score = score_strategy(clone, success)
                if score > max_score:
                    max_score = score
                    best_name = name

        if best_name:
            features['best_strategy'] = best_name
            dataset.append(features)

            # 4. Apply the "best" strategy to the actual disk to advance simulation
            idx = next((i for i, n in enumerate(disk.inodes) if n is None), None)
            if idx is not None:
                inode = Inode(idx, size=req_size)
                success = STRATEGIES[best_name](disk, req_size, inode)
                if success:
                    disk.inodes[idx] = inode
                    disk.file_map[f"file_{_}"] = idx

    # Save to CSV
    if dataset:
        with open(OUTPUT_FILE, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=dataset[0].keys())
            writer.writeheader()
            writer.writerows(dataset)
        print(f"Success! Saved {len(dataset)} samples to {OUTPUT_FILE}")
    else:
        print("Error: No data generated.")

if __name__ == "__main__":
    run_simulation()
