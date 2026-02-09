import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const PULSE_PERIOD = 1.5;
const INNER_RADIUS = 0.6;
const OUTER_RADIUS = 1.8;

export function ComparisonMarkers() {
  const comparisonResult = useSpaceStore((s) => s.comparisonResult);

  const sphereARef = useRef<THREE.Mesh>(null);
  const sphereBRef = useRef<THREE.Mesh>(null);
  const glowARef = useRef<THREE.Mesh>(null);
  const glowBRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // Build dashed line geometry between A and B
  const lineGeometry = useMemo(() => {
    if (!comparisonResult) return null;

    const { coordsA, coordsB } = comparisonResult;
    const positions = new Float32Array([
      coordsA[0], coordsA[1], coordsA[2],
      coordsB[0], coordsB[1], coordsB[2],
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [comparisonResult]);

  // Midpoint for the label
  const midpoint = useMemo<[number, number, number] | null>(() => {
    if (!comparisonResult) return null;
    const { coordsA, coordsB } = comparisonResult;
    return [
      (coordsA[0] + coordsB[0]) / 2,
      (coordsA[1] + coordsB[1]) / 2,
      (coordsA[2] + coordsB[2]) / 2,
    ];
  }, [comparisonResult]);

  // Pulsation animation
  useFrame((_, delta) => {
    if (!comparisonResult) return;

    timeRef.current += delta;
    const t = (timeRef.current % PULSE_PERIOD) / PULSE_PERIOD;
    const wave = Math.sin(t * Math.PI * 2);

    const innerScale = 1.0 + 0.3 * wave;
    const outerScale = 1.0 - 0.15 * wave;

    if (sphereARef.current) sphereARef.current.scale.setScalar(innerScale);
    if (sphereBRef.current) sphereBRef.current.scale.setScalar(innerScale);
    if (glowARef.current) glowARef.current.scale.setScalar(outerScale);
    if (glowBRef.current) glowBRef.current.scale.setScalar(outerScale);
  });

  if (!comparisonResult) return null;

  const { coordsA, coordsB, similarity } = comparisonResult;

  return (
    <group>
      {/* Point A - Cyan */}
      <group position={coordsA}>
        <mesh ref={sphereARef}>
          <sphereGeometry args={[INNER_RADIUS, 16, 16]} />
          <meshBasicMaterial
            color="#00ffff"
            transparent
            opacity={0.8}
            fog={false}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={glowARef}>
          <sphereGeometry args={[OUTER_RADIUS, 16, 16]} />
          <meshBasicMaterial
            color="#00ffff"
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
            fog={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Point B - Magenta */}
      <group position={coordsB}>
        <mesh ref={sphereBRef}>
          <sphereGeometry args={[INNER_RADIUS, 16, 16]} />
          <meshBasicMaterial
            color="#ff00ff"
            transparent
            opacity={0.8}
            fog={false}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={glowBRef}>
          <sphereGeometry args={[OUTER_RADIUS, 16, 16]} />
          <meshBasicMaterial
            color="#ff00ff"
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
            fog={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Dashed line connecting A and B */}
      {lineGeometry && (
        <line geometry={lineGeometry}>
          <lineDashedMaterial
            color="#ffffff"
            transparent
            opacity={0.4}
            dashSize={1.0}
            gapSize={0.5}
          />
        </line>
      )}

      {/* Similarity label at midpoint */}
      {midpoint && (
        <group position={midpoint}>
          <Html center distanceFactor={40} style={{ pointerEvents: 'none' }}>
            <div className="rounded bg-black/70 px-2 py-1 text-xs text-white whitespace-nowrap backdrop-blur-sm">
              {(similarity * 100).toFixed(1)}%
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}
