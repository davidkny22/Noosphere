import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const PULSE_PERIOD = 1.5;
const FADE_DELAY = 3.0;
const FADE_DURATION = 1.5;
const INNER_RADIUS = 0.6;
const OUTER_RADIUS = 1.8;

export function ProjectedMarker() {
  const flyToTarget = useSpaceStore((s) => s.flyToTarget);
  const flyToState = useSpaceStore((s) => s.flyToState);
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);
  const visibleRef = useRef(false);

  // Reset timer when a new fly-to settles
  useEffect(() => {
    if (flyToState === 'settling' && flyToTarget) {
      timeRef.current = 0;
      visibleRef.current = true;
    }
  }, [flyToState, flyToTarget]);

  useFrame((_, delta) => {
    if (!innerRef.current || !outerRef.current || !groupRef.current) return;
    if (!visibleRef.current) {
      groupRef.current.visible = false;
      return;
    }

    timeRef.current += delta;
    groupRef.current.visible = true;

    // Fade out after delay
    let fadeAlpha = 1.0;
    if (timeRef.current > FADE_DELAY) {
      fadeAlpha = Math.max(0, 1.0 - (timeRef.current - FADE_DELAY) / FADE_DURATION);
      if (fadeAlpha <= 0) {
        visibleRef.current = false;
        groupRef.current.visible = false;
        return;
      }
    }

    const t = (timeRef.current % PULSE_PERIOD) / PULSE_PERIOD;
    const wave = Math.sin(t * Math.PI * 2);

    // Inner sphere: pulsate scale and opacity
    const innerScale = 1.0 + 0.3 * wave;
    innerRef.current.scale.setScalar(innerScale);
    const innerMat = innerRef.current.material as THREE.MeshBasicMaterial;
    innerMat.opacity = (0.7 + 0.3 * wave) * fadeAlpha;

    // Outer glow: inverse pulsation for breathing effect
    const outerScale = 1.0 - 0.15 * wave;
    outerRef.current.scale.setScalar(outerScale);
    const outerMat = outerRef.current.material as THREE.MeshBasicMaterial;
    outerMat.opacity = (0.12 + 0.08 * wave) * fadeAlpha;
  });

  if (!flyToTarget) return null;

  return (
    <group ref={groupRef} position={flyToTarget} visible={false}>
      {/* Inner bright core */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[INNER_RADIUS, 16, 16]} />
        <meshBasicMaterial
          color={0x60a5fa}
          transparent
          opacity={0.8}
          fog={false}
          depthWrite={false}
        />
      </mesh>
      {/* Outer glow halo */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[OUTER_RADIUS, 16, 16]} />
        <meshBasicMaterial
          color={0x3b82f6}
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          fog={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
