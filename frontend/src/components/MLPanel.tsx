import React, { useState } from 'react';
import { MLDecisionEntry, MLHealth, MLStats, BenchmarkReport } from '../hooks/useFileSystem';

// ─── Probability Bar ────────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
    'Contiguous Allocation': '#3b82f6',  // blue
    'Linked Allocation': '#22c55e',  // green
    'Indexed Allocation': '#a855f7',  // purple
    'EXT2-like Allocation': '#f59e0b',  // amber
};

function ProbBar({ label, value, total }: { label: string; value: number; total: number }) {
    const pct = value * 100;
    const color = STRATEGY_COLORS[label] || '#6b7280';
    return (
        <div className="mb-1.5">
            <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-300 truncate" style={{ maxWidth: '160px' }}>
                    {label.replace(' Allocation', '').replace('-like', '')}
                </span>
                <span className="font-mono font-semibold" style={{ color }}>
                    {pct.toFixed(1)}%
                </span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
}

// ─── Decision Log Entry ───────────────────────────────────────────────────────

function DecisionCard({ entry }: { entry: MLDecisionEntry }) {
    const [expanded, setExpanded] = useState(false);
    const color = STRATEGY_COLORS[entry.predictedStrategy] || '#6b7280';
    const confPct = (entry.confidence * 100).toFixed(0);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mb-2">
            {/* Header Row */}
            <div
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-750"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs font-semibold text-white truncate" style={{ maxWidth: '140px' }}>
                        {entry.predictedStrategy.replace(' Allocation', '').replace('-like', '')}
                    </span>
                    <span className="text-xs text-gray-400">{confPct}% conf</span>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`text-xs px-1.5 py-0.5 rounded ${entry.allocationSuccess
                            ? 'bg-green-900/60 text-green-300'
                            : 'bg-red-900/60 text-red-300'
                            }`}
                    >
                        {entry.allocationSuccess ? '✓ OK' : '✗ FAIL'}
                    </span>
                    <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {/* Expanded Details */}
            {expanded && (
                <div className="px-3 pb-3 border-t border-gray-700 pt-2">
                    <div className="text-xs text-gray-500 mb-2">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                        {' • '}
                        Overhead: {entry.mlOverheadMs.toFixed(1)}ms
                    </div>

                    {/* Probability Bars */}
                    {Object.keys(entry.probabilities).length > 0 && (
                        <div className="mb-3">
                            <div className="text-xs text-gray-400 mb-1.5 font-semibold">Strategy Confidence</div>
                            {Object.entries(entry.probabilities)
                                .sort(([, a], [, b]) => b - a)
                                .map(([label, prob]) => (
                                    <ProbBar
                                        key={label}
                                        label={label}
                                        value={prob}
                                        total={Math.max(...Object.values(entry.probabilities))}
                                    />
                                ))
                            }
                        </div>
                    )}

                    {/* Feature Vector */}
                    <div className="text-xs text-gray-400 mb-1 font-semibold">Feature Vector</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {[
                            ['FileSz', `${entry.features.fileSizeRequested.toFixed(1)}KB`],
                            ['FreeBlks', `${(entry.features.freeBlockRatio * 100).toFixed(0)}%`],
                            ['ExtFrag', `${(entry.features.externalFragPct * 100).toFixed(0)}%`],
                            ['IntFrag', `${(entry.features.internalFragPct * 100).toFixed(0)}%`],
                            ['Seek', entry.features.avgSeekDistance.toFixed(3)],
                            ['CreateRate', entry.features.fileCreateRate.toFixed(2)],
                            ['DelRate', entry.features.fileDeleteRate.toFixed(2)],
                            ['Util', `${(entry.features.diskUtilizationPct * 100).toFixed(0)}%`],
                        ].map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs">
                                <span className="text-gray-500">{k}</span>
                                <span className="text-gray-200 font-mono">{v}</span>
                            </div>
                        ))}
                    </div>

                    {/* Post-allocation metrics */}
                    <div className="mt-2 grid grid-cols-2 gap-1">
                        <div className="bg-gray-900 rounded p-1.5">
                            <div className="text-xs text-gray-500">Post Frag</div>
                            <div className="text-xs font-mono text-red-300">
                                {(entry.postFragmentation * 100).toFixed(1)}%
                            </div>
                        </div>
                        <div className="bg-gray-900 rounded p-1.5">
                            <div className="text-xs text-gray-500">Post Util</div>
                            <div className="text-xs font-mono text-yellow-300">
                                {(entry.postUtilization * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── ML Health Badge ─────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: MLHealth | null }) {
    if (!health) return <span className="text-xs text-gray-500">Checking...</span>;
    if (!health.available) {
        return (
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400">Service Offline</span>
            </div>
        );
    }
    if (!health.modelLoaded) {
        return (
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-xs text-yellow-400">Heuristic Mode</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-400">
                {health.modelType || 'Model'} • {((health.accuracy || 0) * 100).toFixed(1)}% acc
            </span>
        </div>
    );
}

// ─── Stats Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
    return (
        <div className="bg-gray-900 rounded-lg p-2.5 text-center">
            <div className="text-xs text-gray-500 mb-0.5">{label}</div>
            <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
        </div>
    );
}

// ─── Benchmark Result Table ───────────────────────────────────────────────────

function BenchmarkTable({ report }: { report: BenchmarkReport }) {
    const modes = Object.keys(report);
    const modeLabels: Record<string, string> = {
        baseline_ext2: 'EXT2 Static',
        ml_advised: 'ML-Advised',
    };

    const baseline = report['baseline_ext2'];
    const mlResult = report['ml_advised'];

    if (!baseline || !mlResult) return null;

    const fragDelta = ((baseline.avgFragmentation - mlResult.avgFragmentation) / Math.max(0.001, baseline.avgFragmentation) * 100);
    const seekDelta = ((baseline.avgSeekDistance - mlResult.avgSeekDistance) / Math.max(0.001, baseline.avgSeekDistance) * 100);
    const succDelta = ((mlResult.successRate - baseline.successRate) * 100);

    return (
        <div className="mt-3">
            <div className="text-xs font-semibold text-gray-300 mb-2">Benchmark Results</div>

            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-gray-700">
                        <th className="text-left text-gray-500 pb-1 pr-2">Metric</th>
                        {modes.map(m => (
                            <th key={m} className="text-right text-gray-400 pb-1 px-1">
                                {modeLabels[m] || m}
                            </th>
                        ))}
                        <th className="text-right text-gray-400 pb-1 pl-1">Δ</th>
                    </tr>
                </thead>
                <tbody className="space-y-1">
                    {[
                        { label: 'Success Rate', fmt: (r: any) => `${(r.successRate * 100).toFixed(1)}%`, delta: succDelta, deltaUnit: 'pp', positive: true },
                        { label: 'Avg Frag %', fmt: (r: any) => `${(r.avgFragmentation * 100).toFixed(1)}%`, delta: fragDelta, deltaUnit: '%', positive: true },
                        { label: 'Avg Seek', fmt: (r: any) => r.avgSeekDistance.toFixed(4), delta: seekDelta, deltaUnit: '%', positive: true },
                    ].map(({ label, fmt, delta, deltaUnit, positive }) => (
                        <tr key={label} className="border-b border-gray-800">
                            <td className="text-gray-500 py-1 pr-2">{label}</td>
                            {modes.map(m => (
                                <td key={m} className="text-right text-gray-200 font-mono py-1 px-1">
                                    {fmt(report[m])}
                                </td>
                            ))}
                            <td className={`text-right font-mono font-semibold py-1 pl-1 ${(positive && delta > 0) || (!positive && delta < 0)
                                ? 'text-green-400' : 'text-red-400'
                                }`}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)}{deltaUnit}
                            </td>
                        </tr>
                    ))}
                    {mlResult.predictionAccuracy !== undefined && (
                        <tr className="border-b border-gray-800">
                            <td className="text-gray-500 py-1 pr-2">ML Accuracy</td>
                            <td className="text-right text-gray-600 font-mono py-1 px-1">N/A</td>
                            <td className="text-right text-blue-300 font-mono py-1 px-1">
                                {(mlResult.predictionAccuracy! * 100).toFixed(1)}%
                            </td>
                            <td className="text-right font-mono py-1 pl-1 text-gray-500">—</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {mlResult.avgMlOverheadMs !== undefined && (
                <div className="mt-2 text-xs text-gray-500">
                    ML overhead: <span className="text-gray-300 font-mono">{mlResult.avgMlOverheadMs.toFixed(2)}ms</span> per allocation
                </div>
            )}
        </div>
    );
}

// ─── Main ML Panel ─────────────────────────────────────────────────────────────

interface MLPanelProps {
    mlEnabled: boolean;
    mlServiceAvailable: boolean;
    lastMLPrediction: string | null;
    lastMLConfidence: number;
    mlStats: MLStats | null;
    mlLog: MLDecisionEntry[];
    mlHealth: MLHealth | null;
    benchmarkResult: BenchmarkReport | null;
    benchmarkRunning: boolean;
    onToggleML: (enabled: boolean) => void;
    onRunBenchmark: (ops: number) => void;
}

export const MLPanel: React.FC<MLPanelProps> = ({
    mlEnabled, mlServiceAvailable, lastMLPrediction, lastMLConfidence,
    mlStats, mlLog, mlHealth, benchmarkResult, benchmarkRunning,
    onToggleML, onRunBenchmark
}) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'log' | 'benchmark'>('overview');
    const [benchmarkOps, setBenchmarkOps] = useState(50);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between"
                style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
            >
                <div className="flex items-center gap-2">
                    <div className="text-lg">🤖</div>
                    <div>
                        <div className="text-sm font-bold text-purple-300">ML Strategy Advisor</div>
                        <HealthBadge health={mlHealth} />
                    </div>
                </div>

                {/* Toggle */}
                <button
                    onClick={() => onToggleML(!mlEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-all duration-300 ${mlEnabled ? 'bg-purple-600' : 'bg-gray-600'
                        }`}
                >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${mlEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                </button>
            </div>

            {/* Status Banner */}
            {mlEnabled && (
                <div className="px-3 py-1.5 text-xs border-b border-gray-700"
                    style={{ background: mlServiceAvailable ? 'rgba(139, 92, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}
                >
                    {lastMLPrediction ? (
                        <span>
                            Last: <strong className="text-purple-300">{lastMLPrediction.replace(' Allocation', '').replace('-like', '')}</strong>
                            {' '}<span className="text-gray-400">({(lastMLConfidence * 100).toFixed(0)}% conf)</span>
                        </span>
                    ) : (
                        <span className="text-gray-400">Awaiting first file creation...</span>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-700">
                {(['overview', 'log', 'benchmark'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 text-xs py-2 transition-colors capitalize ${activeTab === tab
                            ? 'text-purple-300 border-b-2 border-purple-500 bg-gray-750'
                            : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="p-3">

                {/* OVERVIEW TAB */}
                {activeTab === 'overview' && (
                    <div>
                        {mlStats && mlStats.totalDecisions > 0 ? (
                            <>
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <StatCard label="Decisions" value={String(mlStats.totalDecisions)} color="text-purple-300" />
                                    <StatCard
                                        label="Success Rate"
                                        value={`${(mlStats.successRate * 100).toFixed(0)}%`}
                                        color="text-green-300"
                                    />
                                    <StatCard
                                        label="Avg Frag"
                                        value={`${(mlStats.avgFragmentation * 100).toFixed(1)}%`}
                                        color={mlStats.avgFragmentation > 0.5 ? 'text-red-300' : 'text-yellow-300'}
                                    />
                                    <StatCard
                                        label="Avg Overhead"
                                        value={mlStats.avgOverheadMs ? `${mlStats.avgOverheadMs.toFixed(1)}ms` : 'N/A'}
                                        color="text-blue-300"
                                    />
                                </div>

                                {/* Strategy Distribution */}
                                <div className="text-xs text-gray-400 mb-1.5 font-semibold">Strategy Distribution</div>
                                {Object.entries(mlStats.strategyDistribution || {})
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([s, c]) => (
                                        <ProbBar
                                            key={s}
                                            label={s}
                                            value={c / mlStats.totalDecisions}
                                            total={1}
                                        />
                                    ))
                                }
                            </>
                        ) : (
                            <div className="text-center py-6">
                                <div className="text-3xl mb-2">🧠</div>
                                <div className="text-xs text-gray-400">
                                    {mlEnabled
                                        ? 'Create files to see ML decisions here'
                                        : 'Enable ML to activate the advisor'
                                    }
                                </div>
                            </div>
                        )}

                        {/* Feature legend */}
                        {mlHealth?.featureImportances && Object.keys(mlHealth.featureImportances).length > 0 && (
                            <div className="mt-3">
                                <div className="text-xs text-gray-400 mb-1.5 font-semibold">Model Feature Importance</div>
                                {Object.entries(mlHealth.featureImportances)
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 5)
                                    .map(([feat, imp]) => (
                                        <ProbBar key={feat} label={feat} value={imp} total={1} />
                                    ))
                                }
                            </div>
                        )}
                    </div>
                )}

                {/* LOG TAB */}
                {activeTab === 'log' && (
                    <div>
                        {mlLog.length === 0 ? (
                            <div className="text-center py-6">
                                <div className="text-2xl mb-2">📋</div>
                                <div className="text-xs text-gray-400">No ML decisions logged yet</div>
                            </div>
                        ) : (
                            <div className="max-h-80 overflow-y-auto space-y-1 pr-1"
                                style={{ scrollbarWidth: 'thin' }}
                            >
                                {[...mlLog].reverse().map(entry => (
                                    <DecisionCard key={entry.id} entry={entry} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* BENCHMARK TAB */}
                {activeTab === 'benchmark' && (
                    <div>
                        <div className="text-xs text-gray-400 mb-3">
                            Run a controlled experiment comparing Static EXT2 vs ML-Advised allocation.
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                            <label className="text-xs text-gray-400 whitespace-nowrap">Ops:</label>
                            <input
                                type="number"
                                min={10}
                                max={200}
                                value={benchmarkOps}
                                onChange={e => setBenchmarkOps(Number(e.target.value))}
                                className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                            />
                            <button
                                onClick={() => onRunBenchmark(benchmarkOps)}
                                disabled={benchmarkRunning}
                                className={`flex-1 py-1.5 rounded text-xs font-semibold transition-all ${benchmarkRunning
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-purple-700 hover:bg-purple-600 text-white'
                                    }`}
                            >
                                {benchmarkRunning ? '⏳ Running...' : '▶ Run Benchmark'}
                            </button>
                        </div>

                        {benchmarkResult && <BenchmarkTable report={benchmarkResult} />}
                    </div>
                )}
            </div>
        </div>
    );
};
