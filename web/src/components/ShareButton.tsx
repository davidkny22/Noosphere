import { useState, useCallback } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';
import { buildShareUrl } from '../systems/bookmark';
import type { BookmarkState } from '../systems/bookmark';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const store = useSpaceStore.getState();

    // Camera position/target aren't in Zustand — read from the Three.js canvas
    // We access the R3F store via the canvas's __r3f internals
    const canvas = document.querySelector('canvas');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r3fStore = (canvas as any)?.__r3f?.store?.getState();
    const camera = r3fStore?.camera;
    const controls = r3fStore?.controls;

    if (!camera) return;

    const target = controls?.target;
    const cameraTarget: [number, number, number] = target
      ? [target.x, target.y, target.z]
      : [0, 0, 0];

    const state: BookmarkState = {
      spaceUrl: store.spaceUrl,
      cameraPos: [camera.position.x, camera.position.y, camera.position.z],
      cameraTarget,
      spaceScale: store.spaceScale,
      colorMode: store.colorMode,
      controlMode: store.controlMode,
      selectedTerm: store.selectedPoint?.term ?? null,
    };

    const url = buildShareUrl(state);

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: update URL bar
      window.history.replaceState(null, '', url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  return (
    <button
      onClick={handleShare}
      className="fixed bottom-4 right-[17rem] z-40 rounded-full bg-black/60 px-3 py-1.5 text-xs font-mono text-white/70 backdrop-blur-sm hover:bg-black/80 hover:text-white border border-white/10"
      title="Copy shareable link to current view"
    >
      {copied ? 'COPIED!' : 'SHARE'}
    </button>
  );
}
