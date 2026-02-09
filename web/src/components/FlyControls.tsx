import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useSpaceStore } from '../store/useSpaceStore';

export function FlyControls() {
  const controlMode = useSpaceStore((s) => s.controlMode);
  const { camera } = useThree();
  const keys = useRef({ w: false, s: false, a: false, d: false, q: false, e: false });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) (keys.current as any)[k] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) (keys.current as any)[k] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (controlMode !== 'fly') return;
    const speed = 20 * delta;
    if (keys.current.w) camera.translateZ(-speed);
    if (keys.current.s) camera.translateZ(speed);
    if (keys.current.a) camera.translateX(-speed);
    if (keys.current.d) camera.translateX(speed);
    if (keys.current.q) camera.translateY(-speed);
    if (keys.current.e) camera.translateY(speed);
  });

  return null;
}
