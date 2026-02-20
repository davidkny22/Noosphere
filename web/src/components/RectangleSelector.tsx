import { useState, useEffect, useRef } from 'react';
import { pickRectangle } from '../hooks/useGpuPicking';
import { useSpaceStore } from '../store/useSpaceStore';

/**
 * Shift+drag rectangle selection overlay.
 * Draws a visual selection rectangle, then reads the GPU picking texture
 * to find all points inside and highlights them.
 */
export function RectangleSelector() {
  const [visualRect, setVisualRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number } | null>(null);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      dragState.current = {
        startX: e.clientX - r.left,
        startY: e.clientY - r.top,
      };
      setVisualRect({ x: e.clientX - r.left, y: e.clientY - r.top, w: 0, h: 0 });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragState.current) return;
      const r = canvas.getBoundingClientRect();
      const curX = e.clientX - r.left;
      const curY = e.clientY - r.top;
      const sx = dragState.current.startX;
      const sy = dragState.current.startY;

      setVisualRect({
        x: Math.min(sx, curX),
        y: Math.min(sy, curY),
        w: Math.abs(curX - sx),
        h: Math.abs(curY - sy),
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragState.current) return;
      const r = canvas.getBoundingClientRect();
      const curX = e.clientX - r.left;
      const curY = e.clientY - r.top;
      const sx = dragState.current.startX;
      const sy = dragState.current.startY;

      dragState.current = null;
      setVisualRect(null);

      const x = Math.min(sx, curX);
      const y = Math.min(sy, curY);
      const w = Math.abs(curX - sx);
      const h = Math.abs(curY - sy);

      // Ignore tiny drags (accidental shift+click)
      if (w < 5 || h < 5) return;

      const indices = pickRectangle({ x, y, w, h });
      if (indices.size > 0) {
        const store = useSpaceStore.getState();
        store.setHighlightedIndices(indices);
        store.setColorMode('highlight');
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  if (!visualRect || visualRect.w < 2) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 border border-blue-400/60 bg-blue-400/10"
      style={{
        left: visualRect.x,
        top: visualRect.y,
        width: visualRect.w,
        height: visualRect.h,
      }}
    />
  );
}
