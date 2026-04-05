import { useState } from 'react'
import { useFileSystem } from './hooks/useFileSystem'
import { DiskGrid } from './components/DiskGrid'
import { MLPanel } from './components/MLPanel'

const STRATEGY_OPTIONS = [
    { key: 'contiguous', label: 'Contiguous', name: 'Contiguous Allocation', color: '#3b82f6' },
    { key: 'linked', label: 'Linked', name: 'Linked Allocation', color: '#22c55e' },
    { key: 'indexed', label: 'Indexed', name: 'Indexed Allocation', color: '#a855f7' },
    { key: 'ext2', label: 'EXT2', name: 'EXT2-like Allocation', color: '#f59e0b' },
];

function MetricBadge({ label, value, sub, color = '#94a3b8' }: {
    label: string; value: string; sub?: string; color?: string;
}) {
    return (
        <div className="text-center">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="font-bold font-mono text-sm" style={{ color }}>{value}</div>
            {sub && <div className="text-xs text-gray-600">{sub}</div>}
        </div>
    );
}

function App() {
    const {
        state, error, mlLog, mlHealth, benchmarkResult, benchmarkRunning,
        createFile, deleteFile, formatDisk, setStrategy, toggleML, runBenchmark
    } = useFileSystem();

    const [newFileName, setNewFileName] = useState('');
    const [newFileSize, setNewFileSize] = useState(3);
    const [activeStratTab, setActiveStratTab] = useState<'manual' | 'info'>('manual');

    if (!state) {
        return (
            <div className="min-h-screen flex items-center justify-center"
                style={{ background: '#0f0f1a' }}>
                <div className="text-center">
                    <div className="text-4xl mb-4 animate-spin">⚙️</div>
                    <div className="text-gray-400 font-mono">Loading FS Simulator...</div>
                </div>
            </div>
        );
    }

    const totalBlocks = state.blocks.length;
    const freeBlocks = state.blocks.filter(b => b.type === 'FREE').length;
    const usedBlocks = totalBlocks - freeBlocks;
    const utilization = ((usedBlocks / totalBlocks) * 100).toFixed(1);
    const fragLevel = ((state.metrics?.fragmentationLevel || 0) * 100).toFixed(1);

    // Count free holes
    let freeHoles = 0, inHole = false;
    for (const b of state.blocks) {
        if (b.type === 'FREE') { if (!inHole) { freeHoles++; inHole = true; } }
        else { inHole = false; }
    }

    const currentStratOption = STRATEGY_OPTIONS.find(s => state.strategy.includes(s.name) || state.strategy === s.name);

    return (
        <div className="min-h-screen text-white font-sans" style={{ background: '#0f0f1a' }}>

            {/* ─── Top Nav Bar ─────────────────────────────── */}
            <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50"
                style={{ background: 'rgba(15, 15, 26, 0.8)', backdropFilter: 'blur(20px)' }}
            >
                <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="text-3xl drop-shadow-lg">💿</div>
                        <div>
                            <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 tracking-tight">
                                FS Allocation Simulator
                            </h1>
                            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">OS Research | ML-Assisted Strategy Selection</p>
                        </div>
                    </div>

                    {/* Header Metrics */}
                    <div className="hidden md:flex items-center gap-8">
                        <MetricBadge
                            label="Strategy"
                            value={state.strategy.replace(' Allocation', '').replace('-like', '')}
                            color={currentStratOption?.color || '#94a3b8'}
                        />
                        <MetricBadge
                            label="Utilization"
                            value={`${utilization}%`}
                            sub={`${usedBlocks}/${totalBlocks} blocks`}
                            color={Number(utilization) > 80 ? '#ef4444' : '#f59e0b'}
                        />
                        <MetricBadge
                            label="Ext Frag"
                            value={`${fragLevel}%`}
                            sub={`${freeHoles} holes`}
                            color={Number(fragLevel) > 50 ? '#ef4444' : '#22c55e'}
                        />
                        <MetricBadge
                            label="ML Advisor"
                            value={state.mlEnabled ? 'ON' : 'OFF'}
                            sub={state.mlServiceAvailable ? 'Service ✓' : 'Offline'}
                            color={state.mlEnabled ? '#a855f7' : '#6b7280'}
                        />
                    </div>
                </div>
            </header>

            {/* ─── Error Banner ─────────────────────────────── */}
            {error && (
                <div className="mx-6 mt-3 bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-sm text-red-300">
                    ⚠️ {error}
                </div>
            )}

            {/* ─── Main Layout ──────────────────────────────── */}
            <main className="max-w-[1600px] mx-auto grid grid-cols-12 gap-6 p-6 min-h-[calc(100vh-80px)]">

                {/* LEFT: Controls (3 cols) */}
                <aside className="col-span-3 space-y-3 overflow-y-auto pr-1"
                    style={{ scrollbarWidth: 'thin' }}
                >
                    {/* File Create Panel */}
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                        <h2 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
                            <span>📂</span> Create File
                        </h2>

                        <div className="space-y-2.5">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">File Name</label>
                                <input
                                    id="file-name-input"
                                    type="text"
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    placeholder="e.g. docs.txt"
                                    value={newFileName}
                                    onChange={e => setNewFileName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && createFile(newFileName, newFileSize * 1024)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                    Size (KB): <span className="text-white font-mono">{newFileSize} KB</span>
                                </label>
                                <input
                                    type="range"
                                    min={1} max={12} step={1}
                                    value={newFileSize}
                                    onChange={e => setNewFileSize(Number(e.target.value))}
                                    className="w-full accent-blue-500"
                                />
                                <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                                    <span>1KB</span><span>12KB</span>
                                </div>
                            </div>

                            <button
                                id="create-file-btn"
                                onClick={() => {
                                    if (!newFileName.trim()) return;
                                    createFile(newFileName, newFileSize * 1024);
                                    setNewFileName('');
                                }}
                                className="w-full py-2 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02] active:scale-95"
                                style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
                            >
                                {state.mlEnabled ? '🤖 Allocate (ML)' : '💾 Allocate File'}
                            </button>
                        </div>
                    </div>

                    {/* Strategy Panel */}
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                        <h2 className="text-sm font-semibold text-green-300 mb-3 flex items-center gap-2">
                            <span>⚙️</span> Allocation Strategy
                        </h2>

                        <div className="space-y-1.5">
                            {STRATEGY_OPTIONS.map(opt => {
                                const isActive = state.strategy === opt.name;
                                return (
                                    <button
                                        key={opt.key}
                                        onClick={() => setStrategy(opt.key)}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all border ${isActive
                                            ? 'border-opacity-60 bg-opacity-20'
                                            : 'border-gray-700 bg-gray-900 hover:bg-gray-750 text-gray-400'
                                            }`}
                                        style={isActive ? {
                                            border: `1px solid ${opt.color}60`,
                                            background: `${opt.color}15`,
                                            color: opt.color
                                        } : {}}
                                    >
                                        <span>{opt.label}</span>
                                        {isActive && <span style={{ color: opt.color }}>◉ Active</span>}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-3 text-xs text-gray-600 text-center">
                            Strategy applies to new allocations
                        </div>
                    </div>

                    {/* File List */}
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                        <h2 className="text-sm font-semibold text-yellow-300 mb-3 flex items-center gap-2">
                            <span>📋</span> Files
                            <span className="text-xs font-normal text-gray-500">({state.files.length})</span>
                        </h2>

                        <div className="max-h-44 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: 'thin' }}>
                            {state.files.length === 0 && (
                                <div className="text-xs text-gray-600 italic text-center py-3">No files on disk</div>
                            )}
                            {state.files.map(f => (
                                <div key={f.name}
                                    className="flex items-center justify-between bg-gray-900 hover:bg-gray-850 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <div
                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: `hsl(${f.id * 137.5 % 360}, 70%, 55%)` }}
                                        />
                                        <span className="text-gray-200 font-mono truncate" style={{ maxWidth: '110px' }}>
                                            {f.name}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => deleteFile(f.name)}
                                        className="text-gray-600 hover:text-red-400 transition-colors text-xs px-1"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Disk Controls */}
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                        <h2 className="text-sm font-semibold text-red-300 mb-3 flex items-center gap-2">
                            <span>🗄️</span> Disk
                        </h2>
                        <button
                            id="format-disk-btn"
                            onClick={formatDisk}
                            className="w-full py-1.5 border border-red-800 bg-red-900/20 hover:bg-red-900/40 text-red-300 rounded-lg text-xs font-medium transition-all"
                        >
                            ⚠️ Format Disk
                        </button>
                        <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-center">
                            <div className="bg-gray-900 rounded p-1.5">
                                <div className="text-gray-500">Total</div>
                                <div className="font-mono text-gray-300">{totalBlocks}</div>
                            </div>
                            <div className="bg-gray-900 rounded p-1.5">
                                <div className="text-gray-500">Used</div>
                                <div className="font-mono text-yellow-300">{usedBlocks}</div>
                            </div>
                            <div className="bg-gray-900 rounded p-1.5">
                                <div className="text-gray-500">Free</div>
                                <div className="font-mono text-green-300">{freeBlocks}</div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* CENTER: Disk Map (6 cols) */}
                <section className="col-span-6 flex flex-col gap-3">

                    {/* Disk Grid */}
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex-1">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-gray-200">
                                💽 Virtual Disk Map
                                <span className="text-xs font-normal text-gray-500 ml-2">
                                    {totalBlocks} blocks × {state.config.blockSize / 1024}KB
                                </span>
                            </h2>

                            {/* Legend */}
                            <div className="flex items-center gap-3 text-xs text-gray-400">
                                <div className="flex items-center gap-1">
                                    <div className="w-3 h-3 rounded-sm bg-gray-700" />
                                    Free
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-3 h-3 rounded-sm bg-blue-500" />
                                    Data
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-3 h-3 rounded-sm bg-purple-500" />
                                    Index
                                </div>
                            </div>
                        </div>

                        <DiskGrid blocks={state.blocks} />
                    </div>

                    {/* Metrics Row */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            {
                                label: 'Fragmentation',
                                value: `${fragLevel}%`,
                                icon: '🧩',
                                color: Number(fragLevel) > 50 ? '#ef4444' : '#22c55e',
                                desc: 'External frag'
                            },
                            {
                                label: 'Seek Distance',
                                value: (state.metrics?.avgAccessTime || 0).toFixed(2),
                                icon: '🔍',
                                color: '#60a5fa',
                                desc: 'Avg blocks'
                            },
                            {
                                label: 'Avg File Size',
                                value: `${((state.metrics?.avgFileSize || 0) / 1024).toFixed(1)}KB`,
                                icon: '📄',
                                color: '#a78bfa',
                                desc: 'Per inode'
                            },
                            {
                                label: 'Throughput',
                                value: `${((state.metrics?.throughput || 0) / 1024).toFixed(1)}K`,
                                icon: '⚡',
                                color: '#fbbf24',
                                desc: 'Bytes/sec'
                            },
                        ].map(({ label, value, icon, color, desc }) => (
                            <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center">
                                <div className="text-xl mb-1">{icon}</div>
                                <div className="text-xs text-gray-500">{label}</div>
                                <div className="font-bold font-mono text-sm mt-0.5" style={{ color }}>{value}</div>
                                <div className="text-xs text-gray-600">{desc}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* RIGHT: ML Panel (3 cols) */}
                <aside className="col-span-3 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                    <MLPanel
                        mlEnabled={state.mlEnabled}
                        mlServiceAvailable={state.mlServiceAvailable}
                        lastMLPrediction={state.lastMLPrediction}
                        lastMLConfidence={state.lastMLConfidence}
                        mlStats={state.mlStats}
                        mlLog={mlLog}
                        mlHealth={mlHealth}
                        benchmarkResult={benchmarkResult}
                        benchmarkRunning={benchmarkRunning}
                        onToggleML={toggleML}
                        onRunBenchmark={runBenchmark}
                    />
                </aside>

            </main>
        </div>
    )
}

export default App
