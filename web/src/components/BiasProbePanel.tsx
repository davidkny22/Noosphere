import { useState, useCallback } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';

export function BiasProbePanel() {
  const embeddingService = useSpaceStore((s) => s.embeddingService);
  const setBiasScores = useSpaceStore((s) => s.setBiasScores);
  const setColorMode = useSpaceStore((s) => s.setColorMode);
  const colorMode = useSpaceStore((s) => s.colorMode);

  const [poleA, setPoleA] = useState('');
  const [poleB, setPoleB] = useState('');
  const [loading, setLoading] = useState(false);

  const probe = useCallback(async () => {
    if (!embeddingService || !poleA.trim() || !poleB.trim()) return;

    setLoading(true);
    try {
      const scores = await embeddingService.biasProbe(poleA.trim(), poleB.trim());
      // Extract score values in index order
      const scoreArray = scores
        .sort((a, b) => a.index - b.index)
        .map((s) => s.score);
      setBiasScores(scoreArray);
      setColorMode('bias_gradient');
    } catch (err) {
      console.error('Bias probe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [embeddingService, poleA, poleB, setBiasScores, setColorMode]);

  const clear = useCallback(() => {
    setBiasScores([]);
    setColorMode('cluster');
  }, [setBiasScores, setColorMode]);

  if (!embeddingService) return null;

  return (
    <div className="fixed left-4 bottom-4 z-40 w-64 rounded-lg bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 text-xs uppercase tracking-wider text-white/40">Bias Probe</div>

      <div className="mb-2">
        <input
          type="text"
          value={poleA}
          onChange={(e) => setPoleA(e.target.value)}
          placeholder="Pole A (e.g., science)"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-white/30">vs</span>
        <input
          type="text"
          value={poleB}
          onChange={(e) => setPoleB(e.target.value)}
          placeholder="Pole B (e.g., art)"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={probe}
          disabled={loading || !poleA.trim() || !poleB.trim()}
          className="flex-1 rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white disabled:opacity-50"
        >
          {loading ? 'Probing...' : 'Probe'}
        </button>
        {colorMode === 'bias_gradient' && (
          <button
            onClick={clear}
            className="rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {colorMode === 'bias_gradient' && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-red-400">{poleA || 'A'}</span>
          <div className="mx-2 h-2 flex-1 rounded" style={{
            background: 'linear-gradient(to right, rgb(230,51,51), rgb(128,128,128), rgb(51,102,230))'
          }} />
          <span className="text-blue-400">{poleB || 'B'}</span>
        </div>
      )}
    </div>
  );
}
