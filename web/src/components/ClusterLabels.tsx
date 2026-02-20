import { useRef, useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const FONT_SIZE = 1.0;
const MAX_OPACITY = 0.7;
const MIN_OPACITY = 0.05;

const _worldPos = new THREE.Vector3();

/**
 * Single cluster label with depth-based opacity fade.
 * Uses exponential falloff: close labels are prominent, far labels ghost out.
 * Opacity is quantized to avoid excessive troika-three-text resyncs.
 */
function DepthFadingLabel({
  position,
  label,
  fadeScale,
}: {
  position: [number, number, number];
  label: string;
  fadeScale: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textRef = useRef<any>(null);
  const { camera } = useThree();
  const lastOpacity = useRef(-1);

  useFrame(() => {
    const text = textRef.current;
    if (!text) return;

    text.getWorldPosition(_worldPos);
    const dist = camera.position.distanceTo(_worldPos);

    // Exponential fade: close → MAX_OPACITY, far → MIN_OPACITY
    const raw = MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * Math.exp(-dist / fadeScale);
    // Quantize to 20 levels to avoid per-frame troika syncs
    const opacity = Math.round(raw * 20) / 20;

    if (opacity !== lastOpacity.current) {
      lastOpacity.current = opacity;
      text.fillOpacity = opacity;
      text.outlineOpacity = opacity * 0.5;
    }
  });

  return (
    <Billboard position={position} follow lockX={false} lockY={false} lockZ={false}>
      <Text
        ref={textRef}
        fontSize={FONT_SIZE}
        color="white"
        anchorX="center"
        anchorY="middle"
        fillOpacity={MAX_OPACITY}
        outlineWidth={0.05}
        outlineColor="black"
        outlineOpacity={MAX_OPACITY * 0.5}
        {...{ fog: true } as Record<string, unknown>}
      >
        {label}
      </Text>
    </Billboard>
  );
}

export function ClusterLabels() {
  const space = useSpaceStore((s) => s.space);
  const introState = useSpaceStore((s) => s.introState);
  const spaceScale = useSpaceStore((s) => s.spaceScale);

  // Compute fade decay constant from space extent (in world-space units)
  const fadeScale = useMemo(() => {
    if (!space) return 100;
    let maxDist = 0;
    for (const cluster of space.clusters) {
      const [x, y, z] = cluster.centroid;
      const d = Math.sqrt(x * x + y * y + z * z);
      if (d > maxDist) maxDist = d;
    }
    // 1.5x max centroid distance × spaceScale gives comfortable fade range
    return (maxDist || 100) * spaceScale * 1.5;
  }, [space, spaceScale]);

  if (!space || introState !== 'done') return null;

  return (
    <>
      {space.clusters.map((cluster) => (
        <DepthFadingLabel
          key={cluster.id}
          position={cluster.centroid}
          label={cluster.label}
          fadeScale={fadeScale}
        />
      ))}
    </>
  );
}
