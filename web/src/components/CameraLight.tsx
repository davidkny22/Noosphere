import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Warm point light that follows the camera with a slight offset.
 * Points near the camera are always well-lit, giving depth even in dark fog regions.
 * Inspired by TF Embedding Projector's camera light tracking.
 */
export function CameraLight() {
  const lightRef = useRef<THREE.PointLight>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!lightRef.current) return;
    lightRef.current.position.set(
      camera.position.x + 1,
      camera.position.y + 1,
      camera.position.z,
    );
  });

  return <pointLight ref={lightRef} color="#FFE4BF" intensity={0.5} decay={0} />;
}
