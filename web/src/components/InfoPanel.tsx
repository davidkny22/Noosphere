import { useState, useCallback } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';
import type { Neighbor } from '../services/embeddingService';

export function InfoPanel() {
  const selectedPoint = useSpaceStore((s) => s.selectedPoint);
  const selectedUserEmbed = useSpaceStore((s) => s.selectedUserEmbed);
  const space = useSpaceStore((s) => s.space);
  const selectPoint = useSpaceStore((s) => s.selectPoint);
  const selectUserEmbed = useSpaceStore((s) => s.selectUserEmbed);
  const removeUserEmbed = useSpaceStore((s) => s.removeUserEmbed);
  const embeddingService = useSpaceStore((s) => s.embeddingService);
  const setNeighborhood = useSpaceStore((s) => s.setNeighborhood);
  const setColorMode = useSpaceStore((s) => s.setColorMode);
  const neighborCenter = useSpaceStore((s) => s.neighborCenter);
  const flyTo = useSpaceStore((s) => s.flyTo);

  const [loadingNeighbors, setLoadingNeighbors] = useState(false);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);

  const showNeighbors = useCallback(async () => {
    if (!embeddingService || !selectedPoint || !space) return;

    const pointIndex = space.points.findIndex((p) => p.term === selectedPoint.term);
    if (pointIndex < 0) return;

    setLoadingNeighbors(true);
    try {
      const result = await embeddingService.neighbors(String(pointIndex), 10);
      setNeighbors(result);
      setNeighborhood(pointIndex, result.map((n) => n.index));
      setColorMode('neighborhood');
    } catch (err) {
      console.error('Failed to load neighbors:', err);
    } finally {
      setLoadingNeighbors(false);
    }
  }, [embeddingService, selectedPoint, space, setNeighborhood, setColorMode]);

  const clearNeighbors = useCallback(() => {
    setNeighborhood(null, []);
    setNeighbors([]);
    setColorMode('cluster');
  }, [setNeighborhood, setColorMode]);

  const handleClose = useCallback(() => {
    selectPoint(null);
    selectUserEmbed(null);
    setNeighbors([]);
    if (neighborCenter != null) {
      clearNeighbors();
    }
  }, [selectPoint, selectUserEmbed, neighborCenter, clearNeighbors]);

  if (!space) return null;

  // User embed panel
  if (selectedUserEmbed) {
    return (
      <div className="fixed right-4 top-4 z-40 w-72 rounded-lg bg-black/80 p-4 text-white backdrop-blur-sm">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg font-semibold">{selectedUserEmbed.label}</h2>
          <button
            onClick={handleClose}
            className="ml-2 text-white/40 hover:text-white/80 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="mb-3">
          <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
            User Embed
          </span>
        </div>

        <div className="mb-3">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Position</div>
          <div className="font-mono text-xs text-white/60">
            [{selectedUserEmbed.pos.map((v) => v.toFixed(1)).join(', ')}]
          </div>
        </div>

        <div className="mb-3">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Created</div>
          <div className="text-xs text-white/60">
            {new Date(selectedUserEmbed.createdAt).toLocaleDateString()}
          </div>
        </div>

        <button
          onClick={() => {
            removeUserEmbed(selectedUserEmbed.id);
            selectUserEmbed(null);
          }}
          className="w-full rounded bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30 hover:text-red-200"
        >
          Delete Embed
        </button>
      </div>
    );
  }

  // Regular point panel
  if (!selectedPoint) return null;

  const cluster = space.clusters.find((c) => c.id === selectedPoint.cluster);
  const pointIndex = space.points.findIndex((p) => p.term === selectedPoint.term);
  const isShowingNeighbors = neighborCenter === pointIndex;

  // For distance bars: scale relative to the max distance in the neighbor set
  const maxDist = neighbors.length > 0
    ? Math.max(...neighbors.map((n) => n.distance))
    : 1;

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

      {/* Neighbor list with distance bars */}
      {isShowingNeighbors && neighbors.length > 0 && (
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
            Neighbors ({neighbors.length})
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            {neighbors.map((n, i) => {
              const barWidth = maxDist > 0 ? (1 - n.distance / maxDist) * 100 : 100;
              return (
                <button
                  key={n.index}
                  onClick={() => {
                    const point = space.points[n.index];
                    if (point) {
                      selectPoint(point);
                      flyTo(point.pos);
                    }
                  }}
                  className="group relative flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
                >
                  <span className="w-4 shrink-0 text-xs text-white/30 tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-white/80 group-hover:text-white">
                      {n.term}
                    </div>
                    <div className="mt-0.5 h-1 w-full rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-blue-400/60"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-white/30">
                    {n.distance.toFixed(3)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Model</div>
        <div className="text-xs text-white/60">{space.model_full}</div>
      </div>
    </div>
  );
}
