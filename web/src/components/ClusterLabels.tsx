import { Html } from '@react-three/drei';
import { useSpaceStore } from '../store/useSpaceStore';

export function ClusterLabels() {
  const space = useSpaceStore((s) => s.space);

  if (!space) return null;

  return (
    <>
      {space.clusters.map((cluster) => (
        <Html
          key={cluster.id}
          position={cluster.centroid}
          distanceFactor={20}
          style={{ pointerEvents: 'none' }}
        >
          <div className="whitespace-nowrap text-xs font-medium text-white/40 select-none">
            {cluster.label}
          </div>
        </Html>
      ))}
    </>
  );
}
