import { useEffect, useRef, useState } from 'react';
import { useSpaceStore } from '../store/useSpaceStore';

const FLY_HINTS = [
  ['W A S D', 'Move'],
  ['E / Space', 'Up'],
  ['Q / Ctrl', 'Down'],
  ['Mouse drag', 'Look around'],
  ['Scroll', 'Zoom'],
  ['Shift + drag', 'Rectangle select'],
  ['Click point', 'Select & inspect'],
];

const ORBIT_HINTS = [
  ['Left drag', 'Rotate'],
  ['Right drag', 'Pan'],
  ['Ctrl + drag', 'Swap rotate/pan'],
  ['Scroll', 'Zoom'],
  ['Shift + drag', 'Rectangle select'],
  ['Click point', 'Select & inspect'],
];

export function ControlsHint() {
  const controlMode = useSpaceStore((s) => s.controlMode);
  const space = useSpaceStore((s) => s.space);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevModeRef = useRef(controlMode);

  // Show on first space load
  useEffect(() => {
    if (!space) return;
    // Small delay so the expansion animation starts first
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [space]);

  // Show again when control mode changes.
  // State updates are deferred to avoid synchronous cascading renders in the effect body.
  useEffect(() => {
    if (prevModeRef.current === controlMode) return;
    prevModeRef.current = controlMode;
    queueMicrotask(() => {
      setFading(false);
      setVisible(true);
    });
    // Auto-dismiss after fresh show
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setFading(true);
      setTimeout(() => setVisible(false), 500);
    }, 4000);
  }, [controlMode]);

  // Dismiss on any interaction
  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      setFading(true);
      setTimeout(() => setVisible(false), 500);
    };
    // Delay listener attachment so the mode-switch click doesn't immediately dismiss
    const attachTimeout = setTimeout(() => {
      window.addEventListener('pointerdown', dismiss, { once: true });
      window.addEventListener('keydown', dismiss, { once: true });
      window.addEventListener('wheel', dismiss, { once: true });
    }, 300);
    return () => {
      clearTimeout(attachTimeout);
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('wheel', dismiss);
    };
  }, [visible]);

  if (!visible) return null;

  const hints = controlMode === 'fly' ? FLY_HINTS : ORBIT_HINTS;
  const label = controlMode === 'fly' ? 'Fly Mode' : 'Orbit Mode';

  return (
    <div
      className={`fixed left-4 bottom-20 z-40 pointer-events-none transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="rounded-lg bg-black/70 px-4 py-3 backdrop-blur-sm ring-1 ring-white/10">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          {label}
        </div>
        <div className="space-y-1">
          {hints.map(([key, action]) => (
            <div key={key} className="flex items-center gap-3 text-xs">
              <span className="min-w-[90px] font-mono text-white/80">{key}</span>
              <span className="text-white/40">{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
