import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

const ZOOM_SPEED = 5.0;
const MAX_DISTANCE = 300;

/**
 * Custom scroll zoom that moves the camera AND orbit target forward/backward
 * along the view direction. This avoids OrbitControls' dolly behavior which
 * asymptotically approaches the target and effectively caps zoom depth.
 */
export function ScrollZoom() {
  const { camera, gl, controls } = useThree();

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);

      // Scroll down (positive deltaY) = zoom in = move forward
      const delta = -e.deltaY * 0.01 * ZOOM_SPEED;
      const move = direction.multiplyScalar(delta);

      // Block zoom-out if camera would exceed max distance from origin
      const newPos = camera.position.clone().add(move);
      if (delta < 0 && newPos.length() > MAX_DISTANCE) return;

      camera.position.add(move);

      // Also move the OrbitControls target so rotation center follows
      const orbitControls = controls as unknown as { target?: THREE.Vector3 };
      if (orbitControls?.target) {
        orbitControls.target.add(move);
      }
    };

    const domElement = gl.domElement;
    domElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => domElement.removeEventListener('wheel', handleWheel);
  }, [camera, gl, controls]);

  return null;
}
