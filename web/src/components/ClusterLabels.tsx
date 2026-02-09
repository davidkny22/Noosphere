import { useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const CULL_DISTANCE = 100;
const UPDATE_INTERVAL = 0.5; // seconds between culling updates

export function ClusterLabels() {
  const space = useSpaceStore((s) => s.space);
  const { camera } = useThree();
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!space) return;
    elapsed.current += delta;
    if (elapsed.current < UPDATE_INTERVAL) return;
    elapsed.current = 0;

    const newVisible = new Set<number>();
    for (const cluster of space.clusters) {
      const dist = new Vector3(...cluster.centroid).distanceTo(camera.position);
      if (dist <= CULL_DISTANCE) {
        newVisible.add(cluster.id);
      }
    }

    if (newVisible.size !== visibleIds.size) {
      setVisibleIds(newVisible);
    }
  });

  if (!space) return null;

  return (
    <>
      {space.clusters.map((cluster) => {
        if (!visibleIds.has(cluster.id)) return null;

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
