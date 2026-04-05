/**
 * MLDecisionLog.ts
 * 
 * Records every ML prediction and its observed outcome.
 * Used for:
 *   - Runtime monitoring via the /api/ml/log endpoint
 *   - Offline evaluation and research paper statistics
 *   - Detecting model drift over time
 */

import { FeatureVector } from './FeatureExtractor';

export interface MLDecisionEntry {
    id: number;
    timestamp: string;
    features: FeatureVector;
    predictedStrategy: string;
    confidence: number;
    probabilities: Record<string, number>;
    actualStrategy: string;            // Strategy actually used (should match predicted if ML enabled)
    allocationSuccess: boolean;
    postFragmentation: number;         // External frag AFTER allocation
    postUtilization: number;           // Disk utilization AFTER allocation
    seekDistanceDelta: number;         // Change in avg seek distance
    mlOverheadMs: number;              // Time taken for ML call (ms)
    wasOptimal?: boolean;              // Set during evaluation runs
}

export class MLDecisionLog {
    private entries: MLDecisionEntry[] = [];
    private nextId: number = 1;
    private readonly MAX_ENTRIES = 500; // Rolling buffer

    public record(entry: Omit<MLDecisionEntry, 'id' | 'timestamp'>): MLDecisionEntry {
        const full: MLDecisionEntry = {
            id: this.nextId++,
            timestamp: new Date().toISOString(),
            ...entry
        };

        this.entries.push(full);
        if (this.entries.length > this.MAX_ENTRIES) {
            this.entries.shift(); // Rolling window
        }

        return full;
    }

    public getEntries(): MLDecisionEntry[] {
        return [...this.entries];
    }

    public getLatest(n: number = 20): MLDecisionEntry[] {
        return this.entries.slice(-n);
    }

    /**
     * Compute summary statistics for evaluation comparison.
     */
    public getSummaryStats() {
        if (this.entries.length === 0) {
            return {
                totalDecisions: 0,
                successRate: 0,
                avgFragmentation: 0,
                avgSeekDelta: 0,
                avgOverheadMs: 0,
                strategyDistribution: {}
            };
        }

        const successCount = this.entries.filter(e => e.allocationSuccess).length;
        const avgFrag = this.entries.reduce((s, e) => s + e.postFragmentation, 0) / this.entries.length;
        const avgSeek = this.entries.reduce((s, e) => s + e.seekDistanceDelta, 0) / this.entries.length;
        const avgOverhead = this.entries.reduce((s, e) => s + e.mlOverheadMs, 0) / this.entries.length;
        const avgConf = this.entries.reduce((s, e) => s + e.confidence, 0) / this.entries.length;

        const dist: Record<string, number> = {};
        for (const e of this.entries) {
            dist[e.predictedStrategy] = (dist[e.predictedStrategy] || 0) + 1;
        }

        return {
            totalDecisions: this.entries.length,
            successRate: successCount / this.entries.length,
            avgFragmentation: avgFrag,
            avgSeekDelta: avgSeek,
            avgOverheadMs: avgOverhead,
            avgConfidence: avgConf,
            strategyDistribution: dist
        };
    }

    public clear(): void {
        this.entries = [];
        this.nextId = 1;
    }
}
