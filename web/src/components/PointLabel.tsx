import { Html } from '@react-three/drei';
import { useSpaceStore } from '../store/useSpaceStore';

export function PointLabel() {
  const hoveredPoint = useSpaceStore((s) => s.hoveredPoint);
  const space = useSpaceStore((s) => s.space);

  if (!hoveredPoint || !space) return null;

  const cluster = space.clusters.find((c) => c.id === hoveredPoint.cluster);

  return (
    <Html
      position={hoveredPoint.pos}
      distanceFactor={10}
      style={{ pointerEvents: 'none' }}
    >
      <div className="rounded-md bg-black/80 px-3 py-1.5 text-sm text-white backdrop-blur-sm whitespace-nowrap">
        <div className="font-medium">{hoveredPoint.term}</div>
        {cluster && (
          <div className="text-xs text-white/50">{cluster.label}</div>
        )}
      </div>
    </Html>
  );
}
