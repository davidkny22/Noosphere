import { useMemo } from 'react';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

export function NeighborLines() {
  const space = useSpaceStore((s) => s.space);
  const neighborIndices = useSpaceStore((s) => s.neighborIndices);
  const neighborCenter = useSpaceStore((s) => s.neighborCenter);

  const geometry = useMemo(() => {
    if (!space || neighborCenter == null || neighborIndices.length === 0) return null;

    const centerPos = space.points[neighborCenter]?.pos;
    if (!centerPos) return null;

    // 2 vertices per line (center → neighbor)
    const positions = new Float32Array(neighborIndices.length * 6);
    const opacities = new Float32Array(neighborIndices.length * 2);

    for (let i = 0; i < neighborIndices.length; i++) {
      const nPos = space.points[neighborIndices[i]]?.pos;
      if (!nPos) continue;

      const offset = i * 6;
      positions[offset] = centerPos[0];
      positions[offset + 1] = centerPos[1];
      positions[offset + 2] = centerPos[2];
      positions[offset + 3] = nPos[0];
      positions[offset + 4] = nPos[1];
      positions[offset + 5] = nPos[2];

      // Distance fade: closer neighbors = more opaque
      const dx = nPos[0] - centerPos[0];
      const dy = nPos[1] - centerPos[1];
      const dz = nPos[2] - centerPos[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const fade = Math.max(0.15, 1 - dist / 50);
      opacities[i * 2] = fade;
      opacities[i * 2 + 1] = fade * 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [space, neighborIndices, neighborCenter]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.25} />
    </lineSegments>
  );
}
