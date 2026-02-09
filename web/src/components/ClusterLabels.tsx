import { useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const CULL_DISTANCE = 100;

export function ClusterLabels() {
  const space = useSpaceStore((s) => s.space);
  const { camera } = useThree();
  const [, setTick] = useState(0);

  // Re-render every frame so culling updates as the camera moves
  useFrame(() => {
    setTick((t) => t + 1);
  });

  if (!space) return null;

  return (
    <>
      {space.clusters.map((cluster) => {
        const dist = new Vector3(...cluster.centroid).distanceTo(camera.position);
        if (dist > CULL_DISTANCE) return null;

        return (
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
        );
      })}
    </>
  );
}
