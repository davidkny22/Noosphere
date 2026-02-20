import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';
import { decodeBookmark } from '../systems/bookmark';

/**
 * Restores visualization state from a URL hash bookmark.
 * Runs once after the space loads. Skips intro animation when restoring.
 * Must be placed inside the R3F Canvas to access camera/controls.
 */
export function BookmarkRestore() {
  const { camera, controls } = useThree();
  const applied = useRef(false);
  const space = useSpaceStore((s) => s.space);
  const spaceUrl = useSpaceStore((s) => s.spaceUrl);

  useEffect(() => {
    if (applied.current || !space) return;

    const bookmark = decodeBookmark(window.location.hash);
    if (!bookmark) return;

    // Only apply if the bookmark matches the loaded space
    if (bookmark.spaceUrl !== spaceUrl) return;

    applied.current = true;

    const store = useSpaceStore.getState();

    // Skip intro animation — jump straight to final state
    store.setIntroState('done');

    // Apply camera position + target
    camera.position.set(...bookmark.cameraPos);
    camera.lookAt(new THREE.Vector3(...bookmark.cameraTarget));

    // Sync OrbitControls target
    const ctrl = controls as unknown as { target?: THREE.Vector3 } | null;
    if (ctrl?.target) {
      ctrl.target.set(...bookmark.cameraTarget);
    }

    // Apply state
    store.setColorMode(bookmark.colorMode);
    store.setControlMode(bookmark.controlMode);

    // Apply space scale (set directly since cycleSpaceScale only cycles)
    if (bookmark.spaceScale !== store.spaceScale) {
      // Cycle until we hit the right scale
      const scales = [0.5, 1, 2, 3];
      const targetIdx = scales.indexOf(bookmark.spaceScale);
      const currentIdx = scales.indexOf(store.spaceScale);
      if (targetIdx >= 0 && currentIdx >= 0) {
        let steps = (targetIdx - currentIdx + scales.length) % scales.length;
        while (steps-- > 0) store.cycleSpaceScale();
      }
    }

    // Select point by term if specified
    if (bookmark.selectedTerm) {
      const point = space.points.find((p) => p.term === bookmark.selectedTerm);
      if (point) {
        store.selectPoint(point);
      }
    }

    // Clear hash after applying so refreshing starts fresh
    // Use replaceState to avoid adding a history entry
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [space, spaceUrl, camera, controls]);

  return null;
}
