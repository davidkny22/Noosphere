import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

export function Breadcrumbs() {
  const searchHistory = useSpaceStore((s) => s.searchHistory);
  const lineRef = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    if (searchHistory.length < 2) return null;

    const positions = new Float32Array(searchHistory.length * 3);
    for (let i = 0; i < searchHistory.length; i++) {
      const pos = searchHistory[i].pos;
      positions[i * 3] = pos[0];
      positions[i * 3 + 1] = pos[1];
      positions[i * 3 + 2] = pos[2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [searchHistory]);

  // Compute dash distances after geometry is assigned
  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [geometry]);

  if (searchHistory.length < 2) return null;

  return (
    <group>
      {/* Dashed line connecting all waypoints */}
      {geometry && (
        // @ts-expect-error — R3F <line> is THREE.Line, not SVGLineElement
        <line ref={lineRef} geometry={geometry}>
          <lineDashedMaterial
            color="#ffffff"
            transparent
            opacity={0.15}
            dashSize={0.5}
            gapSize={0.3}
          />
        </line>
      )}

      {/* Waypoint spheres */}
      {searchHistory.map((entry, i) => (
        <mesh key={`${entry.timestamp}-${i}`} position={entry.pos}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}
