import { useState, useCallback } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';

export function AnalogyPanel() {
  const embeddingService = useSpaceStore((s) => s.embeddingService);
  const analogyResult = useSpaceStore((s) => s.analogyResult);
  const setAnalogyResult = useSpaceStore((s) => s.setAnalogyResult);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);

  const [termA, setTermA] = useState('');
  const [termB, setTermB] = useState('');
  const [termC, setTermC] = useState('');
  const [loading, setLoading] = useState(false);

  const compute = useCallback(async () => {
    if (!embeddingService || !termA.trim() || !termB.trim() || !termC.trim()) return;

    setLoading(true);
    try {
      const result = await embeddingService.analogy(termA.trim(), termB.trim(), termC.trim());
      useSpaceStore.getState().setAnalogyResult({
        a: termA.trim(),
        b: termB.trim(),
        c: termC.trim(),
        resultTerm: result.result_term,
        coordsResult: result.coords_3d,
        neighbors: result.neighbors,
      });
      useSpaceStore.getState().flyTo(result.coords_3d);
    } catch (err) {
      console.error('Analogy computation failed:', err);
    } finally {
      setLoading(false);
    }
  }, [embeddingService, termA, termB, termC]);

  const clear = useCallback(() => {
    setAnalogyResult(null);
  }, [setAnalogyResult]);

  if (!isAdvancedMode || !embeddingService) return null;

  return (
    <div className="fixed left-4 bottom-48 z-40 w-64 rounded-lg bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 text-xs uppercase tracking-wider text-white/40">
        Analogy Explorer
      </div>

      <div className="mb-3 text-center text-sm text-white/60">
        A is to B as C is to <span className="text-amber-400">___</span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="w-4 shrink-0 text-xs font-semibold text-white/50">A</span>
        <input
          type="text"
          value={termA}
          onChange={(e) => setTermA(e.target.value)}
          placeholder="e.g., king"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="w-4 shrink-0 text-xs font-semibold text-white/50">B</span>
        <input
          type="text"
          value={termB}
          onChange={(e) => setTermB(e.target.value)}
          placeholder="e.g., queen"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="w-4 shrink-0 text-xs font-semibold text-white/50">C</span>
        <input
          type="text"
          value={termC}
          onChange={(e) => setTermC(e.target.value)}
          placeholder="e.g., man"
          className="w-full rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={compute}
          disabled={loading || !termA.trim() || !termB.trim() || !termC.trim()}
          className="flex-1 rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white disabled:opacity-50"
        >
          {loading ? 'Computing...' : 'Compute'}
        </button>
        {analogyResult && (
          <button
            onClick={clear}
            className="rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {analogyResult && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-1 text-xs text-white/40">Result</div>
          <div className="mb-2 text-lg font-bold text-amber-400">
            {analogyResult.resultTerm}
          </div>

          {analogyResult.neighbors.length > 0 && (
            <>
              <div className="mb-1 text-xs text-white/40">Nearby terms</div>
              <ul className="space-y-0.5">
                {analogyResult.neighbors.map((n) => (
                  <li key={n.index} className="text-xs text-white/60">
                    {n.term}
                    <span className="ml-1 text-white/30">
                      ({n.distance.toFixed(3)})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
