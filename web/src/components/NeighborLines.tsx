import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSpaceStore } from '../store/useSpaceStore';

/** Map a bias score [-1, 1] to an RGB triplet (red → gray → blue), intensified for line visibility. */
function biasToColor(score: number): [number, number, number] {
  if (score < 0) {
    const t = -score;
    return [
      Math.min(1, (0.4 + 0.6 * t) * 1.3),
      Math.min(1, (0.4 - 0.35 * t) * 1.3),
      Math.min(1, (0.4 - 0.3 * t) * 1.3),
    ];
  }
  const t = score;
  return [
    Math.min(1, (0.4 - 0.3 * t) * 1.3),
    Math.min(1, (0.4 - 0.1 * t) * 1.3),
    Math.min(1, (0.4 + 0.6 * t) * 1.3),
  ];
}

export function NeighborLines() {
  const space = useSpaceStore((s) => s.space);
  const neighborIndices = useSpaceStore((s) => s.neighborIndices);
  const neighborCenter = useSpaceStore((s) => s.neighborCenter);
  const biasScores = useSpaceStore((s) => s.biasScores);
  const biasLinesEnabled = useSpaceStore((s) => s.biasLinesEnabled);

  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const timeRef = useRef(0);

  const isBiasMode = biasLinesEnabled && biasScores.length > 0;

  const geometry = useMemo(() => {
    if (!space || neighborCenter == null || neighborIndices.length === 0) return null;

    const centerPos = space.points[neighborCenter]?.pos;
    if (!centerPos) return null;

    // 2 vertices per line (center → neighbor)
    const positions = new Float32Array(neighborIndices.length * 6);
    const colors = isBiasMode ? new Float32Array(neighborIndices.length * 6) : null;

    for (let i = 0; i < neighborIndices.length; i++) {
      const nIdx = neighborIndices[i];
      const nPos = space.points[nIdx]?.pos;
      if (!nPos) continue;

      const offset = i * 6;
      positions[offset] = centerPos[0];
      positions[offset + 1] = centerPos[1];
      positions[offset + 2] = centerPos[2];
      positions[offset + 3] = nPos[0];
      positions[offset + 4] = nPos[1];
      positions[offset + 5] = nPos[2];

      if (colors) {
        const score = biasScores[nIdx] ?? 0;
        const [r, g, b] = biasToColor(score);
        // Both vertices of the line get the neighbor's bias color
        colors[offset] = r;
        colors[offset + 1] = g;
        colors[offset + 2] = b;
        colors[offset + 3] = r;
        colors[offset + 4] = g;
        colors[offset + 5] = b;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (colors) {
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    return geo;
  }, [space, neighborIndices, neighborCenter, biasScores, isBiasMode]);

  // Pulse animation for bias mode
  useFrame((_, delta) => {
    if (!isBiasMode || !materialRef.current) return;
    timeRef.current += delta;
    materialRef.current.opacity = 0.5 + 0.4 * Math.sin(timeRef.current * 3);
  });

  if (!geometry) return null;

  if (isBiasMode) {
    return (
      <lineSegments geometry={geometry}>
        <lineBasicMaterial
          ref={materialRef}
          vertexColors
          transparent
          opacity={0.8}
          linewidth={1}
        />
      </lineSegments>
    );
  }

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.25} />
    </lineSegments>
  );
}
