import { useSpaceStore } from '../store/useSpaceStore';

export function InfoPanel() {
  const selectedPoint = useSpaceStore((s) => s.selectedPoint);
  const space = useSpaceStore((s) => s.space);
  const selectPoint = useSpaceStore((s) => s.selectPoint);

  if (!selectedPoint || !space) return null;

  const cluster = space.clusters.find((c) => c.id === selectedPoint.cluster);

  return (
    <div className="fixed right-4 top-4 z-40 w-72 rounded-lg bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between">
        <h2 className="text-lg font-semibold">{selectedPoint.term}</h2>
        <button
          onClick={() => selectPoint(null)}
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

      <div>
        <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Model</div>
        <div className="text-xs text-white/60">{space.model_full}</div>
      </div>
    </div>
  );
}
