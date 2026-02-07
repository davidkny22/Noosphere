import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';
import { easeOutCubic, clamp } from '../utils/math';

const OFFSET_DISTANCE = 15;
const SETTLE_FRAMES = 10;

interface AnimationState {
  startPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endPos: THREE.Vector3;
  endTarget: THREE.Vector3;
  duration: number;
  elapsed: number;
  settleCount: number;
}

export function CameraAnimator() {
  const { camera } = useThree();
  const animRef = useRef<AnimationState | null>(null);
  const interruptedRef = useRef(false);

  const flyToTarget = useSpaceStore((s) => s.flyToTarget);
  const flyToState = useSpaceStore((s) => s.flyToState);

  // Detect user interruption via pointer events on the canvas
  useEffect(() => {
    const handlePointerDown = () => {
      if (flyToState === 'animating') {
        interruptedRef.current = true;
      }
    };
    const handleWheel = () => {
      if (flyToState === 'animating') {
        interruptedRef.current = true;
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('wheel', handleWheel);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [flyToState]);

  // Start animation when flyToTarget changes
  useEffect(() => {
    if (!flyToTarget || flyToState !== 'animating') return;

    const destination = new THREE.Vector3(...flyToTarget);
    const currentPos = camera.position.clone();

    // Compute approach direction to maintain viewing angle
    const direction = currentPos.clone().sub(destination).normalize();
    if (direction.length() < 0.001) {
      direction.set(0, 0, 1);
    }

    const endPos = destination.clone().add(direction.multiplyScalar(OFFSET_DISTANCE));
    const distance = currentPos.distanceTo(endPos);
    const duration = clamp(distance * 0.03, 0.8, 3.0);

    // Get current OrbitControls target (approximate as point camera looks at)
    const currentTarget = new THREE.Vector3();
    camera.getWorldDirection(currentTarget);
    currentTarget.multiplyScalar(OFFSET_DISTANCE).add(currentPos);

    animRef.current = {
      startPos: currentPos,
      startTarget: currentTarget,
      endPos,
      endTarget: destination,
      duration,
      elapsed: 0,
      settleCount: 0,
    };

    interruptedRef.current = false;
  }, [flyToTarget, flyToState, camera]);

  useFrame((state, delta) => {
    const anim = animRef.current;
    if (!anim) return;

    const currentFlyToState = useSpaceStore.getState().flyToState;

    // Handle interruption
    if (interruptedRef.current) {
      animRef.current = null;
      interruptedRef.current = false;
      useSpaceStore.getState().cancelFlyTo();
      return;
    }

    if (currentFlyToState === 'animating') {
      anim.elapsed += delta;
      const t = clamp(anim.elapsed / anim.duration, 0, 1);
      const eased = easeOutCubic(t);

      // Lerp camera position
      camera.position.lerpVectors(anim.startPos, anim.endPos, eased);

      // Lerp look-at target
      const lookTarget = new THREE.Vector3().lerpVectors(
        anim.startTarget,
        anim.endTarget,
        eased
      );
      camera.lookAt(lookTarget);

      // Update OrbitControls target if available
      const controls = state.controls as { target?: THREE.Vector3 } | null;
      if (controls?.target) {
        controls.target.copy(lookTarget);
      }

      if (t >= 1) {
        useSpaceStore.getState().setFlyToState('settling');
      }
    } else if (currentFlyToState === 'settling') {
      anim.settleCount++;
      if (anim.settleCount >= SETTLE_FRAMES) {
        animRef.current = null;
        useSpaceStore.getState().setFlyToState('idle');
      }
    }
  });

  return null;
}
