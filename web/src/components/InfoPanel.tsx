import { useState, useCallback } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';

export function InfoPanel() {
  const selectedPoint = useSpaceStore((s) => s.selectedPoint);
  const space = useSpaceStore((s) => s.space);
  const selectPoint = useSpaceStore((s) => s.selectPoint);
  const embeddingService = useSpaceStore((s) => s.embeddingService);
  const setNeighborhood = useSpaceStore((s) => s.setNeighborhood);
  const setColorMode = useSpaceStore((s) => s.setColorMode);
  const neighborCenter = useSpaceStore((s) => s.neighborCenter);

  const [loadingNeighbors, setLoadingNeighbors] = useState(false);

  const showNeighbors = useCallback(async () => {
    if (!embeddingService || !selectedPoint || !space) return;

    const pointIndex = space.points.findIndex((p) => p.term === selectedPoint.term);
    if (pointIndex < 0) return;

    setLoadingNeighbors(true);
    try {
      const neighbors = await embeddingService.neighbors(String(pointIndex), 10);
      setNeighborhood(pointIndex, neighbors.map((n) => n.index));
      setColorMode('neighborhood');
    } catch (err) {
      console.error('Failed to load neighbors:', err);
    } finally {
      setLoadingNeighbors(false);
    }
  }, [embeddingService, selectedPoint, space, setNeighborhood, setColorMode]);

  const clearNeighbors = useCallback(() => {
    setNeighborhood(null, []);
    setColorMode('cluster');
  }, [setNeighborhood, setColorMode]);

  const handleClose = useCallback(() => {
    selectPoint(null);
    if (neighborCenter != null) {
      clearNeighbors();
    }
  }, [selectPoint, neighborCenter, clearNeighbors]);

  if (!selectedPoint || !space) return null;

  const cluster = space.clusters.find((c) => c.id === selectedPoint.cluster);
  const pointIndex = space.points.findIndex((p) => p.term === selectedPoint.term);
  const isShowingNeighbors = neighborCenter === pointIndex;

  return (
    <div className="fixed right-4 top-4 z-40 w-72 rounded-lg bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between">
        <h2 className="text-lg font-semibold">{selectedPoint.term}</h2>
        <button
          onClick={handleClose}
          className="ml-2 text-white/40 hover:text-white/80 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {cluster && (
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Cluster</div>
          <div className="text-sm font-medium">{cluster.label}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {cluster.representative_terms.map((t) => (
              <span
                key={t}
                className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/70"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Position</div>
        <div className="font-mono text-xs text-white/60">
          [{selectedPoint.pos.map((v) => v.toFixed(1)).join(', ')}]
        </div>
      </div>

      {embeddingService && (
        <div className="mb-3">
          {isShowingNeighbors ? (
            <button
              onClick={clearNeighbors}
              className="w-full rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white"
            >
              Hide Neighbors
            </button>
          ) : (
            <button
              onClick={showNeighbors}
              disabled={loadingNeighbors}
              className="w-full rounded bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white disabled:opacity-50"
            >
              {loadingNeighbors ? 'Loading...' : 'Show Neighbors'}
            </button>
          )}
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Model</div>
        <div className="text-xs text-white/60">{space.model_full}</div>
      </div>
    </div>
  );
}
