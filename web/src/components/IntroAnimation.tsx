import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';
import { easeOutCubic } from '../utils/math';

const PULSE_DURATION = 0.8; // seconds for 2 pulses
const EXPAND_DURATION = 2.0; // seconds for expansion
const TOTAL_DURATION = PULSE_DURATION + EXPAND_DURATION;

export function IntroAnimation() {
  const space = useSpaceStore((s) => s.space);
  const introState = useSpaceStore((s) => s.introState);
  const setIntroState = useSpaceStore.getState().setIntroState;
  const { scene } = useThree();
  const timeRef = useRef(0);
  const targetPositions = useRef<Float32Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointsObjRef = useRef<THREE.Points | null>(null);

  // Safety timeout: if animation doesn't complete within 4s, force 'done'
  useEffect(() => {
    if (introState !== 'animating') return;
    const timeout = setTimeout(() => {
      if (useSpaceStore.getState().introState === 'animating') {
        setIntroState('done');
      }
    }, 4000);
    return () => clearTimeout(timeout);
  }, [introState, setIntroState]);

  // Capture target positions and zero out geometry when animation starts
  useEffect(() => {
    if (introState !== 'animating' || !space) return;

    function tryInit() {
      // Find the Points object in the scene
      let pointsObj: THREE.Points | null = null;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Points && !pointsObj) {
          pointsObj = obj;
        }
      });

      if (!pointsObj) {
        // Points not in scene yet (R3F reconciler timing) — retry next frame
        rafRef.current = requestAnimationFrame(tryInit);
        return;
      }

      pointsObjRef.current = pointsObj;
      const geo = (pointsObj as THREE.Points).geometry;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;

      // Store target positions
      targetPositions.current = new Float32Array(positions);

      // Set all positions to origin
      positions.fill(0);
      posAttr.needsUpdate = true;

      timeRef.current = 0;
    }

    tryInit();

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [introState, space, scene]);

  useFrame((_, delta) => {
    if (introState !== 'animating' || !targetPositions.current) return;

    timeRef.current += delta;
    const t = timeRef.current;

    const pointsObj = pointsObjRef.current;
    if (!pointsObj) return;

    const geo = (pointsObj as THREE.Points).geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const targets = targetPositions.current;

    if (t < PULSE_DURATION) {
      // Pulse phase: oscillate scale around origin
      const pulseT = t / PULSE_DURATION;
      const scale = 0.03 * Math.sin(pulseT * Math.PI * 4); // 2 full pulses
      for (let i = 0; i < positions.length; i++) {
        positions[i] = targets[i] * scale;
      }
    } else if (t < TOTAL_DURATION) {
      // Expand phase: ease from compressed to full
      const expandT = (t - PULSE_DURATION) / EXPAND_DURATION;
      const ease = easeOutCubic(Math.min(expandT, 1));
      for (let i = 0; i < positions.length; i++) {
        positions[i] = targets[i] * ease;
      }
    } else {
      // Done — snap to final positions
      positions.set(targets);
      posAttr.needsUpdate = true;
      targetPositions.current = null;
      setIntroState('done');
      return;
    }

    posAttr.needsUpdate = true;
  });

  return null;
}
