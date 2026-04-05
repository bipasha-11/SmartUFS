"""
evaluate.py
===========
Evaluation Framework: Static EXT2 vs ML-Advised Strategy Selection

Runs controlled experiments comparing a static strategy against the ML advisor.
Produces a quantitative comparison table suitable for a research paper.

Usage:
    python evaluate.py                    # Full evaluation (200 ops)
    python evaluate.py --ops 100          # Fewer operations
    python evaluate.py --seed 123         # Different random seed
"""

import os
import sys
import json
import math
import random
import argparse
import time
import copy
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple

# Reuse the simulation from generate_dataset.py
sys.path.insert(0, os.path.dirname(__file__))
from generate_dataset import (
    SimDisk, Block, Inode, BLOCK_SIZE, TOTAL_BLOCKS, MAX_INODES,
    allocate_contiguous, allocate_linked, allocate_indexed, allocate_ext2,
    extract_features, STRATEGIES
)

# ─── Config ────────────────────────────────────────────────────────────────────

BASE_DIR     = os.path.dirname(__file__)
REPORT_PATH  = os.path.join(BASE_DIR, 'evaluation_report.json')

MODEL_PATH  = os.path.join(BASE_DIR, 'allocation_model.pkl')
DATASET_PATH = os.path.join(BASE_DIR, 'dataset.csv')
FEATURE_COLS = [
    'file_size', 'free_block_ratio', 'external_fragmentation',
    'internal_fragmentation', 'avg_seek_distance', 'creation_rate',
    'deletion_rate', 'disk_utilization'
]

try:
    import joblib
    import numpy as np
    import pandas as pd
    from sklearn.metrics import accuracy_score, confusion_matrix
    from sklearn.model_selection import train_test_split
    
    model = joblib.load(MODEL_PATH) if os.path.exists(MODEL_PATH) else None
except ImportError:
    model = None


# ─── Heuristic Fallback ──────────────────────────────────────────────────────────

def heuristic_predict(features: dict) -> str:
    ext_frag   = features.get('external_fragmentation', 0)
    free_ratio = features.get('free_block_ratio', 1)
    file_size_kb = features.get('file_size', 1)
    util = features.get('disk_utilization', 0)

    if ext_frag > 0.7 or free_ratio < 0.15:
        return 'Linked'
    elif util > 0.85:
        return 'Ext2'
    elif file_size_kb > 5 and ext_frag < 0.3:
        return 'Contiguous'
    elif file_size_kb > 8:
        return 'Indexed'
    else:
        return 'Ext2'


def ml_predict(features: dict) -> Tuple[str, float]:
    """Return (strategy_name, confidence)."""
    if model is None:
        return heuristic_predict(features), 0.0
    try:
        # Create DataFrame with the exact standardized columns
        feat_df = pd.DataFrame([features])[FEATURE_COLS]
        pred   = model.predict(feat_df)[0]
        probas = model.predict_proba(feat_df)[0]
        conf   = float(probas.max())
        return pred, conf
    except Exception:
        return heuristic_predict(features), 0.0


# ─── Standard ML Evaluation ────────────────────────────────────────────────────

def evaluate_model_on_dataset():
    """Evaluate the trained model on a test split of the dataset."""
    if not os.path.exists(DATASET_PATH):
        print(f"[WARN] Dataset not found at {DATASET_PATH}. Skipping ML evaluation.")
        return
    
    if model is None:
        print("[WARN] Model not found. Skipping ML evaluation.")
        return

    print("\n--- Standard ML Evaluation (Test Split) ---")
    df = pd.read_csv(DATASET_PATH)
    if df.empty:
        print("Dataset is empty.")
        return

    X = df[FEATURE_COLS]
    y = df['best_strategy']

    # Use same split as training for consistency in evaluation
    _, X_test, _, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    cm = confusion_matrix(y_test, y_pred)
    
    print(f"Test Accuracy: {acc:.4f}")
    print("Confusion Matrix:")
    print(cm)
    print("-------------------------------------------\n")


# ─── Metrics Tracking ──────────────────────────────────────────────────────────

@dataclass
class RunMetrics:
    name: str
    total_ops: int = 0
    create_attempts: int = 0
    create_successes: int = 0
    total_frag: float = 0.0
    total_seek: float = 0.0
    total_util: float = 0.0
    ml_overhead_ms: float = 0.0
    strategy_choices: Dict[str, int] = field(default_factory=dict)
    correct_predictions: int = 0
    prediction_attempts: int = 0

    @property
    def success_rate(self) -> float:
        return self.create_successes / max(1, self.create_attempts)
    
    @property
    def avg_fragmentation(self) -> float:
        return self.total_frag / max(1, self.create_successes)
    
    @property
    def avg_seek_distance(self) -> float:
        return self.total_seek / max(1, self.create_successes)
    
    @property
    def avg_utilization(self) -> float:
        return self.total_util / max(1, self.total_ops)
    
    @property
    def avg_ml_overhead(self) -> float:
        return self.ml_overhead_ms / max(1, self.prediction_attempts)
    
    @property
    def prediction_accuracy(self) -> float:
        return self.correct_predictions / max(1, self.prediction_attempts)


def measure_disk_metrics(disk: SimDisk) -> Tuple[float, float, float]:
    """Returns (external_frag, avg_seek, utilization)."""
    from generate_dataset import get_external_frag, get_avg_seek
    
    ext_frag = get_external_frag(disk)
    avg_seek = get_avg_seek(disk)
    
    free_count = sum(1 for b in disk.blocks if b.free)
    util = (TOTAL_BLOCKS - free_count) / TOTAL_BLOCKS
    return ext_frag, avg_seek, util


# ─── Single Run Function ──────────────────────────────────────────────────────

def run_experiment(
    mode: str,             # 'static_ext2' | 'ml_advised' | 'static_contiguous' | 'static_linked'
    num_ops: int,
    seed: int,
    verbose: bool = False
) -> RunMetrics:
    """Run one experiment mode and return collected metrics."""
    
    rng = random.Random(seed)
    disk = SimDisk()
    metrics = RunMetrics(name=mode)
    static_fn = allocate_ext2  # Default static strategy

    if mode == 'static_contiguous':
        static_fn = allocate_contiguous
    elif mode == 'static_linked':
        static_fn = allocate_linked
    elif mode == 'static_indexed':
        static_fn = allocate_indexed
    
    inode_counter = [0]
    
    for op_i in range(num_ops):
        metrics.total_ops += 1
        
        # Periodic format to prevent permanent saturation
        if op_i > 0 and op_i % 80 == 0:
            # Simple format: clear disk
            disk = SimDisk()
        
        r = rng.random()
        
        if r < 0.15 and disk.file_map:
            # Delete operation
            fname = rng.choice(list(disk.file_map.keys()))
            fidx = disk.file_map.pop(fname, None)
            if fidx is not None and disk.inodes[fidx]:
                inode = disk.inodes[fidx]
                for bid in inode.direct_blocks:
                    disk.blocks[bid].free = True
                    disk.blocks[bid].file_id = None
                    disk.blocks[bid].type = 'FREE'
                disk.record_op('delete', inode.direct_blocks[0] if inode.direct_blocks else 0)
                disk.inodes[fidx] = None
        
        elif r < 0.25 and disk.file_map:
            # Read operation (just record seek)
            fname = rng.choice(list(disk.file_map.keys()))
            fidx = disk.file_map.get(fname)
            if fidx is not None and disk.inodes[fidx]:
                pos = disk.inodes[fidx].direct_blocks[0] if disk.inodes[fidx].direct_blocks else 0
                disk.record_op('read', pos)
        
        else:
            # Create operation
            size_blocks = rng.randint(1, 12)
            requested_size = size_blocks * BLOCK_SIZE
            
            idx = next((i for i, n in enumerate(disk.inodes) if n is None), None)
            if idx is None:
                continue
            
            inode = Inode(idx, size=requested_size)
            disk.inodes[idx] = inode
            metrics.create_attempts += 1
            
            # --- Choose strategy ---
            chosen_fn = static_fn
            chosen_name = mode
            ml_overhead = 0.0
            
            if mode == 'ml_advised':
                features = extract_features(disk, requested_size)
                t0 = time.time()
                predicted, confidence = ml_predict(features)
                ml_overhead = (time.time() - t0) * 1000
                metrics.ml_overhead_ms += ml_overhead
                metrics.prediction_attempts += 1
                
                # Map name → function
                chosen_fn   = STRATEGIES.get(predicted, allocate_ext2)
                chosen_name = predicted
                
                # Verify if prediction was optimal (check all 4 strategies)
                best_strategy_name, best_score = None, -float('inf')
                for sname, sfn in STRATEGIES.items():
                    c2 = disk.clone()
                    ni = next((i for i, n in enumerate(c2.inodes) if n is None), None)
                    if ni is None:
                        continue
                    ni_obj = Inode(ni, size=requested_size)
                    c2.inodes[ni] = ni_obj
                    success = sfn(c2, requested_size, ni_obj)
                    if success:
                        frag, seek, _ = measure_disk_metrics(c2)
                        score = (1 - frag) * 30 + (1 - seek) * 20
                        if score > best_score:
                            best_score = score
                            best_strategy_name = sname
                
                if best_strategy_name == predicted:
                    metrics.correct_predictions += 1
                
                if verbose:
                    print(f"  op {op_i:3d}: ML predicted '{predicted}' (conf={confidence:.2f})"
                          f" | optimal='{best_strategy_name}' | {'[OK]' if best_strategy_name == predicted else '[MISMATCH]'}")
            
            metrics.strategy_choices[chosen_name] = metrics.strategy_choices.get(chosen_name, 0) + 1
            
            success = chosen_fn(disk, requested_size, inode)
            
            if success:
                metrics.create_successes += 1
                fname = f'file_{inode_counter[0]}'
                inode_counter[0] += 1
                disk.file_map[fname] = idx
                
                frag, seek, util = measure_disk_metrics(disk)
                metrics.total_frag += frag
                metrics.total_seek += seek
                metrics.total_util += util
            else:
                disk.inodes[idx] = None
    
    return metrics


# ─── Print Comparison Table ───────────────────────────────────────────────────

def print_table(runs: Dict[str, RunMetrics]):
    """Print a research-paper-style comparison table."""
    modes = list(runs.keys())
    
    print("\n" + "=" * 80)
    print("  ALLOCATION STRATEGY COMPARISON - EVALUATION RESULTS")
    print("=" * 80)
    
    headers = ['Metric', *[m.replace('_', ' ').title() for m in modes]]
    col_w = 26
    
    # Header row
    print("  " + "  ".join(h.ljust(col_w) for h in headers))
    print("  " + "-" * (col_w * len(headers) + 2 * len(headers)))
    
    def row(label, *vals):
        parts = [label.ljust(col_w)] + [str(v).ljust(col_w) for v in vals]
        print("  " + "  ".join(parts))
    
    row("Allocation Success Rate",
        *[f"{r.success_rate*100:.1f}%" for r in runs.values()])
    
    row("Avg External Frag %",
        *[f"{r.avg_fragmentation*100:.1f}%" for r in runs.values()])
    
    row("Avg Seek Distance (norm)",
        *[f"{r.avg_seek_distance:.4f}" for r in runs.values()])
    
    row("Avg Disk Utilization",
        *[f"{r.avg_utilization*100:.1f}%" for r in runs.values()])
    
    if any(r.prediction_attempts > 0 for r in runs.values()):
        row("ML Prediction Accuracy",
            *[f"{r.prediction_accuracy*100:.1f}%" if r.prediction_attempts > 0 else "N/A"
              for r in runs.values()])
        
        row("Avg ML Overhead (ms)",
            *[f"{r.avg_ml_overhead:.2f}ms" if r.prediction_attempts > 0 else "N/A"
              for r in runs.values()])
    
    row("Total Create Ops",
        *[str(r.create_attempts) for r in runs.values()])
    
    print("  " + "-" * (col_w * len(headers) + 2 * len(headers)))
    
    # Improvement calculations (vs static EXT2 baseline)
    if 'static_ext2' in runs and 'ml_advised' in runs:
        baseline = runs['static_ext2']
        ml_run   = runs['ml_advised']
        
        frag_improvement  = (baseline.avg_fragmentation - ml_run.avg_fragmentation) / max(0.001, baseline.avg_fragmentation) * 100
        seek_improvement  = (baseline.avg_seek_distance - ml_run.avg_seek_distance) / max(0.001, baseline.avg_seek_distance) * 100
        succ_improvement  = (ml_run.success_rate - baseline.success_rate) * 100
        
        print()
        print("   ML ADVISORY IMPROVEMENT OVER STATIC EXT2:")
        print(f"     Fragmentation Reduction:  {frag_improvement:+.1f}%")
        print(f"     Seek Distance Reduction:  {seek_improvement:+.1f}%")
        print(f"     Success Rate Change:      {succ_improvement:+.1f}pp")
        
        if ml_run.prediction_attempts > 0:
            print(f"     ML Prediction Accuracy:   {ml_run.prediction_accuracy*100:.1f}%")
            print(f"     Avg ML Overhead:          {ml_run.avg_ml_overhead:.2f}ms per file creation")
    
    print()
    print("   Strategy Distribution (ML-Advised):")
    if 'ml_advised' in runs:
        total = max(1, runs['ml_advised'].create_attempts)
        for s, c in sorted(runs['ml_advised'].strategy_choices.items(), key=lambda x: -x[1]):
            bar = '#' * int(c / total * 30)
            print(f"     {s:<28} {c:>4} ({c/total*100:5.1f}%) {bar}")
    
    print("=" * 80)


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Evaluate ML vs Static allocation strategies')
    parser.add_argument('--ops',     type=int, default=200, help='Number of operations per run')
    parser.add_argument('--seed',    type=int, default=42,  help='Random seed')
    parser.add_argument('--verbose', action='store_true',   help='Print per-op decisions')
    args = parser.parse_args()

    print(f"\n[EVAL] Starting evaluation: {args.ops} ops/run, seed={args.seed}")
    
    # --- Step 5: Evaluate using test split ---
    evaluate_model_on_dataset()

    if model is None:
        print("[WARN] ML model not found -- using heuristic fallback for ml_advised mode")
    else:
        print(f"[OK] ML model loaded ({type(model).__name__})")
    print()

    modes = ['static_ext2', 'static_contiguous', 'static_linked', 'ml_advised']
    runs  = {}

    for mode in modes:
        print(f"   Running: {mode} ...", end='', flush=True)
        t0 = time.time()
        result = run_experiment(mode, args.ops, args.seed, verbose=(args.verbose and mode == 'ml_advised'))
        elapsed = time.time() - t0
        print(f" done ({elapsed:.1f}s, {result.create_successes}/{result.create_attempts} creates)")
        runs[mode] = result

    print_table(runs)

    # Save JSON report
    report = {}
    for mode, r in runs.items():
        report[mode] = {
            'success_rate':         r.success_rate,
            'avg_fragmentation':    r.avg_fragmentation,
            'avg_seek_distance':    r.avg_seek_distance,
            'avg_utilization':      r.avg_utilization,
            'prediction_accuracy':  r.prediction_accuracy if r.prediction_attempts > 0 else None,
            'avg_ml_overhead_ms':   r.avg_ml_overhead if r.prediction_attempts > 0 else None,
            'create_attempts':      r.create_attempts,
            'create_successes':     r.create_successes,
            'strategy_distribution': r.strategy_choices
        }

    with open(REPORT_PATH, 'w') as f:
        json.dump({'config': {'ops': args.ops, 'seed': args.seed}, 'results': report}, f, indent=2)
    
    print(f"\nFull report saved -> {REPORT_PATH}")


if __name__ == '__main__':
    main()
