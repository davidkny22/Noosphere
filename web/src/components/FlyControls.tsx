import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const MOVE_SPEED = 20;
const LOOK_SPEED = 0.003;

export function FlyControls() {
  const controlMode = useSpaceStore((s) => s.controlMode);
  const { camera, gl } = useThree();
  const keys = useRef({ w: false, s: false, a: false, d: false, q: false, e: false, shift: false, space: false });
  const mouse = useRef({ isDown: false, prevX: 0, prevY: 0 });
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === 'Shift') { keys.current.shift = true; return; }
      if (e.key === ' ') { e.preventDefault(); keys.current.space = true; return; }
      const k = e.key.toLowerCase();
      if (k in keys.current) (keys.current as any)[k] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === 'Shift') { keys.current.shift = false; return; }
      if (e.key === ' ') { keys.current.space = false; return; }
      const k = e.key.toLowerCase();
      if (k in keys.current) (keys.current as any)[k] = false;
    };

    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (useSpaceStore.getState().controlMode !== 'fly') return;
      mouse.current.isDown = true;
      mouse.current.prevX = e.clientX;
      mouse.current.prevY = e.clientY;
    };
    const onMouseUp = () => {
      mouse.current.isDown = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (useSpaceStore.getState().controlMode !== 'fly' || !mouse.current.isDown) return;
      const dx = e.clientX - mouse.current.prevX;
      const dy = e.clientY - mouse.current.prevY;
      mouse.current.prevX = e.clientX;
      mouse.current.prevY = e.clientY;

      euler.current.setFromQuaternion(camera.quaternion);
      euler.current.y -= dx * LOOK_SPEED;
      euler.current.x -= dy * LOOK_SPEED;
      // Clamp pitch to avoid flipping
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    if (controlMode !== 'fly') return;
    const speed = MOVE_SPEED * delta * (keys.current.shift ? 2 : 1);
    if (keys.current.w) camera.translateZ(-speed);
    if (keys.current.s) camera.translateZ(speed);
    if (keys.current.a) camera.translateX(-speed);
    if (keys.current.d) camera.translateX(speed);
    if (keys.current.q) camera.translateY(-speed);
    if (keys.current.e) camera.translateY(speed);
    if (keys.current.space) camera.translateY(speed);
  });

  return null;
}
