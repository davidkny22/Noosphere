import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useSpaceStore } from '../store/useSpaceStore';

const BAR_WIDTH_PX = 100;

/**
 * Runs inside the R3F Canvas — computes bar distance each frame
 * and writes to the store. Renders nothing.
 */
export function DistanceLegendUpdater() {
  const spaceScale = useSpaceStore((s) => s.spaceScale);
  const { camera, gl } = useThree();
  const prevRef = useRef('');

  useFrame(() => {
    const camDist = camera.position.length();
    const fovRad = ((camera as any).fov * Math.PI) / 180;
    const viewportHeight = gl.domElement.clientHeight;

    const screenHeightWorld = 2 * camDist * Math.tan(fovRad / 2);
    const worldPerPx = screenHeightWorld / viewportHeight;
    const dist = (BAR_WIDTH_PX * worldPerPx) / spaceScale;

    // Only update store when the displayed value changes
    const key = formatDistance(dist) + getLabel(dist);
    if (key !== prevRef.current) {
      prevRef.current = key;
      useSpaceStore.setState({ scaleBarDistance: dist });
    }
  });

  return null;
}

function getLabel(distance: number): string {
  if (distance < 5) return 'Close neighbors';
  if (distance < 20) return 'Related';
  if (distance < 50) return 'Weakly related';
  return 'Distant';
}

function formatDistance(d: number): string {
  if (d < 1) return d.toFixed(2);
  if (d < 10) return d.toFixed(1);
  return Math.round(d).toString();
}

/**
 * Renders outside the Canvas as a fixed overlay.
 */
export function DistanceLegend() {
  const barDistance = useSpaceStore((s) => s.scaleBarDistance);
  const space = useSpaceStore((s) => s.space);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);

  if (!space || barDistance === 0 || !isAdvancedMode) return null;

  const label = getLabel(barDistance);

  return (
    <div
      className="fixed bottom-4 left-4 z-40 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10"
      style={{ pointerEvents: 'none' }}
    >
      <div className="mb-1 text-center font-mono text-[10px] text-white/70">
        {formatDistance(barDistance)} units
      </div>
      <div className="relative" style={{ width: BAR_WIDTH_PX, height: 6 }}>
        {/* Bar line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/50" />
        {/* Left tick */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-white/50" />
        {/* Right tick */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-white/50" />
      </div>
      <div className="mt-1 text-center text-[10px] text-white/40">
        {label}
      </div>
    </div>
  );
}
