import { useState, useCallback } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';

export function ComparisonPanel() {
  const embeddingService = useSpaceStore((s) => s.embeddingService);
  const comparisonResult = useSpaceStore((s) => s.comparisonResult);
  const setComparisonResult = useSpaceStore((s) => s.setComparisonResult);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);

  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const [loading, setLoading] = useState(false);

  const compare = useCallback(async () => {
    if (!embeddingService || !textA.trim() || !textB.trim()) return;

    setLoading(true);
    try {
      const result = await embeddingService.compare(textA.trim(), textB.trim());
      const coordsA = result.coordsA;
      const coordsB = result.coordsB;

      useSpaceStore.getState().setComparisonResult({
        textA: textA.trim(),
        textB: textB.trim(),
        similarity: result.similarity,
        coordsA,
        coordsB,
      });

      // Fly camera to midpoint between A and B
      useSpaceStore.getState().flyTo([
        (coordsA[0] + coordsB[0]) / 2,
        (coordsA[1] + coordsB[1]) / 2,
        (coordsA[2] + coordsB[2]) / 2,
      ]);
    } catch (err) {
      console.error('Comparison failed:', err);
    } finally {
      setLoading(false);
    }
  }, [embeddingService, textA, textB]);

  const clear = useCallback(() => {
    setComparisonResult(null);
  }, [setComparisonResult]);

  if (!isAdvancedMode || !embeddingService) return null;

  return (
    <div className="fixed left-4 bottom-20 z-40 w-64 rounded-lg bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 text-xs uppercase tracking-wider text-white/40">Compare</div>

      <div className="mb-2">
        <input
          type="text"
          value={textA}
          onChange={(e) => setTextA(e.target.value)}
          placeholder="Text A"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-white/30">vs</span>
        <input
          type="text"
          value={textB}
          onChange={(e) => setTextB(e.target.value)}
          placeholder="Text B"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={compare}
          disabled={loading || !textA.trim() || !textB.trim()}
          className="flex-1 rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white disabled:opacity-50"
        >
          {loading ? 'Comparing...' : 'Compare'}
        </button>
        {comparisonResult && (
          <button
            onClick={clear}
            className="rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {comparisonResult && (
        <div className="mt-3 text-center text-sm">
          <span className="text-white/50">Similarity: </span>
          <span className="font-mono text-white">
            {(comparisonResult.similarity * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
