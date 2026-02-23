import { useState, useCallback, useMemo } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';

const BIAS_PRESETS = [
  { label: 'Custom', a: '', b: '' },
  { label: 'Gender', a: 'he him his man father son boy male', b: 'she her hers woman mother daughter girl female' },
  { label: 'Race', a: 'black african', b: 'white european' },
  { label: 'Age', a: 'young youth teenage child', b: 'elderly old senior aged' },
  { label: 'Religion', a: 'christian church bible', b: 'muslim mosque quran' },
  { label: 'Socioeconomic', a: 'rich wealthy affluent', b: 'poor impoverished destitute' },
];

export function BiasProbePanel() {
  const embeddingService = useSpaceStore((s) => s.embeddingService);
  const setBiasScores = useSpaceStore((s) => s.setBiasScores);
  const setColorMode = useSpaceStore((s) => s.setColorMode);
  const colorMode = useSpaceStore((s) => s.colorMode);
  const space = useSpaceStore((s) => s.space);
  const biasScores = useSpaceStore((s) => s.biasScores);
  const biasLinesEnabled = useSpaceStore((s) => s.biasLinesEnabled);
  const setBiasLinesEnabled = useSpaceStore((s) => s.setBiasLinesEnabled);
  const setBiasPoles = useSpaceStore((s) => s.setBiasPoles);
  const setBiasStats = useSpaceStore((s) => s.setBiasStats);
  const setBiasPoleSimilarity = useSpaceStore((s) => s.setBiasPoleSimilarity);
  const biasStats = useSpaceStore((s) => s.biasStats);
  const biasPoleSimilarity = useSpaceStore((s) => s.biasPoleSimilarity);
  const biasThreshold = useSpaceStore((s) => s.biasThreshold);
  const setBiasThreshold = useSpaceStore((s) => s.setBiasThreshold);
  const flyTo = useSpaceStore((s) => s.flyTo);
  const selectPoint = useSpaceStore((s) => s.selectPoint);
  const spaceUrl = useSpaceStore((s) => s.spaceUrl);

  const [poleA, setPoleA] = useState('');
  const [poleB, setPoleB] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [showTopTerms, setShowTopTerms] = useState(true);

  const probe = useCallback(async () => {
    if (!embeddingService || !poleA.trim() || !poleB.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await embeddingService.biasProbe(poleA.trim(), poleB.trim());
      const scoreArray = result.scores
        .sort((a, b) => a.index - b.index)
        .map((s) => s.score);
      setBiasScores(scoreArray);
      setBiasPoles({ a: poleA.trim(), b: poleB.trim() });
      setBiasStats(result.stats);
      setBiasPoleSimilarity(result.poleSimilarity);
      setColorMode('bias_gradient');
    } catch (err) {
      console.error('Bias probe failed:', err);
      setError(err instanceof Error ? err.message : 'Bias probe failed — is the server running?');
    } finally {
      setLoading(false);
    }
  }, [embeddingService, poleA, poleB, setBiasScores, setBiasPoles, setBiasStats, setBiasPoleSimilarity, setColorMode]);

  const exportBias = useCallback(() => {
    if (!space || biasScores.length === 0) return;

    const clusterLabelMap = new Map(space.clusters.map(c => [c.id, c.label]));
    const spaceName = spaceUrl.split('/').pop()?.replace(/\.json(\.gz)?$/, '') ?? 'unknown';
    const timestamp = new Date().toISOString();

    const header = [
      `# Noosphere Bias Probe Export`,
      `# Timestamp: ${timestamp}`,
      `# Space: ${spaceName}`,
      `# Pole A: ${poleA}`,
      `# Pole B: ${poleB}`,
      biasPoleSimilarity != null ? `# Pole Similarity: ${biasPoleSimilarity.toFixed(4)}` : '',
      biasStats ? `# Stats: mean=${biasStats.mean.toFixed(4)}, std=${biasStats.std.toFixed(4)}, median=${biasStats.median.toFixed(4)}` : '',
    ].filter(Boolean).join('\n');

    const rows = space.points.map((p, i) => {
      const label = clusterLabelMap.get(p.cluster) ?? 'noise';
      const [x, y, z] = p.pos;
      return `"${p.term}",${biasScores[i]?.toFixed(4) ?? ''},"${label}",${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    });

    const csv = `${header}\nterm,score,cluster,x,y,z\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bias-probe-${poleA.replace(/\s+/g, '_')}-vs-${poleB.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [space, biasScores, poleA, poleB, biasStats, biasPoleSimilarity, spaceUrl]);

  const clear = useCallback(() => {
    setBiasScores([]);
    setBiasLinesEnabled(false);
    setBiasPoles(null);
    setBiasStats(null);
    setBiasPoleSimilarity(null);
    setColorMode('cluster');
  }, [setBiasScores, setBiasLinesEnabled, setBiasPoles, setBiasStats, setBiasPoleSimilarity, setColorMode]);

  const handlePresetChange = useCallback((index: number) => {
    setSelectedPreset(index);
    const preset = BIAS_PRESETS[index];
    if (preset && index > 0) {
      setPoleA(preset.a);
      setPoleB(preset.b);
    }
  }, []);

  // Compute top-10 most biased terms for each pole
  const topTerms = useMemo(() => {
    if (!space || biasScores.length === 0) return null;
    const indexed = biasScores.map((score, i) => ({ score, i }));
    const sortedAsc = [...indexed].sort((a, b) => a.score - b.score);
    const sortedDesc = [...indexed].sort((a, b) => b.score - a.score);
    return {
      topA: sortedAsc.slice(0, 10).map(({ score, i }) => ({
        term: space.points[i].term,
        score,
        index: i,
        pos: space.points[i].pos,
      })),
      topB: sortedDesc.slice(0, 10).map(({ score, i }) => ({
        term: space.points[i].term,
        score,
        index: i,
        pos: space.points[i].pos,
      })),
    };
  }, [space, biasScores]);

  if (!embeddingService) return null;

  const isActive = colorMode === 'bias_gradient';
  const showSimilarityWarning = biasPoleSimilarity != null && biasPoleSimilarity > 0.85;
  const showIdenticalWarning = biasPoleSimilarity != null && biasPoleSimilarity > 0.99;

  return (
    <div className="w-64 rounded-lg bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 text-xs uppercase tracking-wider text-white/40">Bias Probe</div>

      {/* Preset dropdown */}
      <select
        value={selectedPreset}
        onChange={(e) => handlePresetChange(Number(e.target.value))}
        className="mb-2 w-full rounded bg-white/10 px-2 py-1 text-xs text-white/70 outline-none"
      >
        {BIAS_PRESETS.map((p, i) => (
          <option key={p.label} value={i} className="bg-gray-900">
            {p.label}
          </option>
        ))}
      </select>

      <div className="mb-2">
        <input
          type="text"
          value={poleA}
          onChange={(e) => { setPoleA(e.target.value); setSelectedPreset(0); }}
          placeholder="e.g., he him his man father"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs text-white/30">vs</span>
        <input
          type="text"
          value={poleB}
          onChange={(e) => { setPoleB(e.target.value); setSelectedPreset(0); }}
          placeholder="e.g., she her hers woman mother"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="mb-3 text-[10px] text-white/20">
        Multi-word poles create composite vectors
      </div>

      <div className="flex gap-2">
        <button
          onClick={probe}
          disabled={loading || !poleA.trim() || !poleB.trim()}
          className="flex-1 rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white disabled:opacity-50"
        >
          {loading ? 'Probing...' : 'Probe'}
        </button>
        {isActive && (
          <button
            onClick={clear}
            className="rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-500/20 px-2 py-1 text-xs text-red-300">{error}</div>
      )}

      {/* Pole similarity warning */}
      {isActive && showIdenticalWarning && (
        <div className="mt-2 rounded bg-red-500/20 px-2 py-1 text-[10px] text-red-300">
          Poles are identical — no bias axis to measure
        </div>
      )}
      {isActive && showSimilarityWarning && !showIdenticalWarning && (
        <div className="mt-2 rounded bg-yellow-500/20 px-2 py-1 text-[10px] text-yellow-300">
          Poles are very similar ({(biasPoleSimilarity! * 100).toFixed(0)}% overlap) — choose more distinct concepts
        </div>
      )}

      {isActive && (
        <label className="mt-3 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={biasLinesEnabled}
            onChange={(e) => setBiasLinesEnabled(e.target.checked)}
            className="accent-blue-400"
          />
          <span className="text-xs text-white/60">Show pole links</span>
        </label>
      )}

      {biasScores.length > 0 && (
        <button
          onClick={exportBias}
          className="w-full rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white mt-2"
        >
          Export CSV
        </button>
      )}

      {/* Gradient legend */}
      {isActive && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-red-400">{poleA.split(' ')[0] || 'A'}</span>
          <div className="mx-2 h-2 flex-1 rounded" style={{
            background: 'linear-gradient(to right, rgb(230,51,51), rgb(128,128,128), rgb(51,102,230))'
          }} />
          <span className="text-blue-400">{poleB.split(' ')[0] || 'B'}</span>
        </div>
      )}

      {/* Stats summary */}
      {isActive && biasStats && (
        <div className="mt-2 flex gap-3 text-[10px] text-white/40">
          <span>Mean: {biasStats.mean.toFixed(3)}</span>
          <span>Std: {biasStats.std.toFixed(3)}</span>
          <span>|Bias|: {biasStats.absMean.toFixed(3)}</span>
        </div>
      )}

      {/* Neutrality threshold slider */}
      {isActive && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
            <span>Hide neutral |score| &lt;</span>
            <span>{biasThreshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={biasThreshold}
            onChange={(e) => setBiasThreshold(parseFloat(e.target.value))}
            className="w-full h-1 accent-blue-400"
          />
        </div>
      )}

      {/* Top-10 most biased terms */}
      {isActive && topTerms && (
        <div className="mt-3">
          <button
            onClick={() => setShowTopTerms(!showTopTerms)}
            className="flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-white/40 hover:text-white/60"
          >
            <span>Most Biased Terms</span>
            <span>{showTopTerms ? '▾' : '▸'}</span>
          </button>

          {showTopTerms && (
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0">
              {/* Pole A column */}
              <div>
                <div className="text-[9px] uppercase text-red-400/60 mb-1">{poleA.split(' ')[0] || 'A'}</div>
                {topTerms.topA.map((item) => (
                  <button
                    key={item.index}
                    onClick={() => {
                      if (space) {
                        selectPoint(space.points[item.index]);
                        flyTo(item.pos);
                      }
                    }}
                    className="flex w-full items-center justify-between py-0.5 text-[10px] hover:bg-white/10 rounded px-1"
                  >
                    <span className="truncate text-white/70">{item.term}</span>
                    <span className="ml-1 shrink-0 tabular-nums text-red-400/60">{item.score.toFixed(2)}</span>
                  </button>
                ))}
              </div>
              {/* Pole B column */}
              <div>
                <div className="text-[9px] uppercase text-blue-400/60 mb-1">{poleB.split(' ')[0] || 'B'}</div>
                {topTerms.topB.map((item) => (
                  <button
                    key={item.index}
                    onClick={() => {
                      if (space) {
                        selectPoint(space.points[item.index]);
                        flyTo(item.pos);
                      }
                    }}
                    className="flex w-full items-center justify-between py-0.5 text-[10px] hover:bg-white/10 rounded px-1"
                  >
                    <span className="truncate text-white/70">{item.term}</span>
                    <span className="ml-1 shrink-0 tabular-nums text-blue-400/60">{item.score.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
