import { useRef, useState } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const CULL_DISTANCE = 100;
const UPDATE_INTERVAL = 0.25; // seconds between culling updates
const FONT_SIZE = 1.0; // world units — scales naturally with camera distance

export function ClusterLabels() {
  const space = useSpaceStore((s) => s.space);
  const introState = useSpaceStore((s) => s.introState);
  const spaceScale = useSpaceStore((s) => s.spaceScale);
  const { camera } = useThree();
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!space || introState !== 'done') return;
    elapsed.current += delta;
    if (elapsed.current < UPDATE_INTERVAL) return;
    elapsed.current = 0;

    const newVisible = new Set<number>();
    for (const cluster of space.clusters) {
      // Centroids are in data space; scale to world space for correct camera distance
      const dist = new Vector3(...cluster.centroid).multiplyScalar(spaceScale).distanceTo(camera.position);
      if (dist <= CULL_DISTANCE) {
        newVisible.add(cluster.id);
      }
    }

    // Proper set equality — check contents, not just size
    let same = newVisible.size === visibleIds.size;
    if (same) {
      for (const id of newVisible) {
        if (!visibleIds.has(id)) { same = false; break; }
      }
    }
    if (!same) {
      setVisibleIds(newVisible);
    }
  });

  if (!space || introState !== 'done') return null;

  return (
    <>
      {space.clusters.map((cluster) => {
        if (!visibleIds.has(cluster.id)) return null;

        return (
          <Billboard key={cluster.id} position={cluster.centroid} follow lockX={false} lockY={false} lockZ={false}>
            <Text
              fontSize={FONT_SIZE}
              color="white"
              anchorX="center"
              anchorY="middle"
              fillOpacity={0.4}
              outlineWidth={0.05}
              outlineColor="black"
              outlineOpacity={0.3}
              fog
            >
              {cluster.label}
            </Text>
          </Billboard>
        );
      })}
    </>
  );
}
