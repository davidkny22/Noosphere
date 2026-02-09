import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSpaceStore } from '../store/useSpaceStore';

const WHITE = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color(1.0, 0.85, 0.2);

interface MarkerProps {
  position: [number, number, number];
  color: THREE.Color;
  label: string;
  radius?: number;
}

function Marker({ position, color, label, radius = 0.5 }: MarkerProps) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          fog={false}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 2.2, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          fog={false}
          depthWrite={false}
        />
      </mesh>
      <Html distanceFactor={80} center style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
          {label}
        </div>
      </Html>
    </group>
  );
}

export function AnalogyMarkers() {
  const analogyResult = useSpaceStore((s) => s.analogyResult);
  const space = useSpaceStore((s) => s.space);

  const positions = useMemo(() => {
    if (!analogyResult || !space) return null;

    const findPos = (term: string): [number, number, number] | null => {
      const lower = term.toLowerCase();
      const point = space.points.find((p) => p.term.toLowerCase() === lower);
      return point ? point.pos : null;
    };

    const posA = findPos(analogyResult.a);
    const posB = findPos(analogyResult.b);
    const posC = findPos(analogyResult.c);
    const posResult = analogyResult.coordsResult;

    return { posA, posB, posC, posResult };
  }, [analogyResult, space]);

  const lineGeometry = useMemo(() => {
    if (!positions) return null;
    const { posA, posB, posC, posResult } = positions;

    const segments: number[] = [];

    // Line A -> B
    if (posA && posB) {
      segments.push(posA[0], posA[1], posA[2]);
      segments.push(posB[0], posB[1], posB[2]);
    }

    // Line C -> result (parallel vector)
    if (posC && posResult) {
      segments.push(posC[0], posC[1], posC[2]);
      segments.push(posResult[0], posResult[1], posResult[2]);
    }

    if (segments.length === 0) return null;

    const arr = new Float32Array(segments);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }, [positions]);

  if (!analogyResult || !positions) return null;

  const { posA, posB, posC, posResult } = positions;

  return (
    <group>
      {/* Term markers */}
      {posA && <Marker position={posA} color={WHITE} label={analogyResult.a} />}
      {posB && <Marker position={posB} color={WHITE} label={analogyResult.b} />}
      {posC && <Marker position={posC} color={WHITE} label={analogyResult.c} />}
      <Marker position={posResult} color={GOLD} label={analogyResult.resultTerm} radius={0.7} />

      {/* Parallel vector lines */}
      {lineGeometry && (
        <lineSegments geometry={lineGeometry}>
          <lineDashedMaterial
            color="#ffffff"
            transparent
            opacity={0.4}
            dashSize={1.0}
            gapSize={0.5}
            fog={false}
          />
        </lineSegments>
      )}
    </group>
  );
}
