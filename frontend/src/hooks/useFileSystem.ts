import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

export interface Block {
    id: number;
    type: string;
    fileId: number | null;
}

export interface FileEntry {
    name: string;
    id: number;
}

export interface SystemMetrics {
    avgFileSize: number;
    readWriteRatio: number;
    accessFrequency: number;
    fragmentationLevel: number;
    avgAccessTime: number;
    throughput: number;
}

export interface MLStats {
    totalDecisions: number;
    successRate: number;
    avgFragmentation: number;
    avgSeekDelta: number;
    avgOverheadMs: number;
    avgConfidence: number;
    strategyDistribution: Record<string, number>;
}

export interface MLDecisionEntry {
    id: number;
    timestamp: string;
    predictedStrategy: string;
    confidence: number;
    probabilities: Record<string, number>;
    actualStrategy: string;
    allocationSuccess: boolean;
    postFragmentation: number;
    postUtilization: number;
    mlOverheadMs: number;
    features: {
        fileSizeRequested: number;
        freeBlockRatio: number;
        externalFragPct: number;
        internalFragPct: number;
        avgSeekDistance: number;
        fileCreateRate: number;
        fileDeleteRate: number;
        diskUtilizationPct: number;
    };
}

export interface MLHealth {
    available: boolean;
    modelLoaded: boolean;
    modelType?: string;
    accuracy?: number;
    cvMean?: number;
    cvStd?: number;
    trainSamples?: number;
    featureImportances?: Record<string, number>;
}

export interface FSState {
    blocks: Block[];
    config: { diskSize: number; blockSize: number; };
    strategy: string;
    files: FileEntry[];
    metrics: SystemMetrics;
    mlEnabled: boolean;
    mlServiceAvailable: boolean;
    lastMLPrediction: string | null;
    lastMLConfidence: number;
    mlStats: MLStats;
}

export interface BenchmarkReport {
    [mode: string]: {
        successRate: number;
        avgFragmentation: number;
        avgSeekDistance: number;
        avgUtilization: number;
        predictionAccuracy?: number;
        avgMlOverheadMs?: number;
        createAttempts: number;
        createSuccesses: number;
        strategyDistribution?: Record<string, number>;
    };
}

const API_URL = 'http://127.0.0.1:3001/api';

export function useFileSystem() {
    const [state, setState] = useState<FSState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mlLog, setMlLog] = useState<MLDecisionEntry[]>([]);
    const [mlHealth, setMlHealth] = useState<MLHealth | null>(null);
    const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkReport | null>(null);
    const [benchmarkRunning, setBenchmarkRunning] = useState(false);

    const fetchState = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/state`);
            setState(res.data);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        }
    }, []);

    const fetchMLLog = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/ml/log?n=30`);
            setMlLog(res.data.entries || []);
        } catch {
            // Silently fail
        }
    }, []);

    const checkMLHealth = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/ml/health`);
            setMlHealth({ available: true, ...res.data });
        } catch {
            setMlHealth({ available: false, modelLoaded: false });
        }
    }, []);

    const createFile = async (name: string, size: number) => {
        try {
            const res = await axios.post(`${API_URL}/files`, { name, size });
            if (!res.data.success) {
                setError(`Allocation failed: ${res.data.error}`);
            } else {
                setError(null);
            }
            await fetchState();
            await fetchMLLog();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const deleteFile = async (name: string) => {
        try {
            await axios.delete(`${API_URL}/files/${name}`);
            await fetchState();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const formatDisk = async () => {
        await axios.post(`${API_URL}/format`);
        await fetchState();
        setMlLog([]);
        setBenchmarkResult(null);
    };

    const setStrategy = async (strategy: string) => {
        await axios.post(`${API_URL}/strategy`, { strategy });
        await fetchState();
    };

    const toggleML = async (enabled: boolean) => {
        await axios.post(`${API_URL}/ml`, { enabled });
        await fetchState();
        if (enabled) await checkMLHealth();
    };

    const runBenchmark = async (numOps: number = 50) => {
        setBenchmarkRunning(true);
        setBenchmarkResult(null);
        try {
            const res = await axios.post(`${API_URL}/ml/benchmark`, { numOps });
            if (res.data.success) {
                setBenchmarkResult(res.data.report);
            }
        } catch (err: any) {
            setError(`Benchmark failed: ${err.message}`);
        } finally {
            setBenchmarkRunning(false);
            await fetchState();
        }
    };

    useEffect(() => {
        fetchState();
        checkMLHealth();
        const interval = setInterval(() => {
            fetchState();
            fetchMLLog();
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return {
        state,
        error,
        mlLog,
        mlHealth,
        benchmarkResult,
        benchmarkRunning,
        createFile,
        deleteFile,
        formatDisk,
        setStrategy,
        toggleML,
        runBenchmark,
        checkMLHealth,
    };
}
