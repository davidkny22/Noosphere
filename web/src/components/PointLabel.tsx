import { useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useSpaceStore } from '../store/useSpaceStore';

const PROXIMITY_DISTANCE = 12;
const MAX_PROXIMITY_LABELS = 15;
const UPDATE_INTERVAL = 0.25; // seconds between proximity checks

export function PointLabel() {
  const hoveredPoint = useSpaceStore((s) => s.hoveredPoint);
  const hoveredUserEmbed = useSpaceStore((s) => s.hoveredUserEmbed);
  const space = useSpaceStore((s) => s.space);
  const { camera } = useThree();
  const [nearbyPoints, setNearbyPoints] = useState<
    { term: string; pos: [number, number, number]; dist: number }[]
  >([]);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!space) return;
    elapsed.current += delta;
    if (elapsed.current < UPDATE_INTERVAL) return;
    elapsed.current = 0;

    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const threshold = PROXIMITY_DISTANCE * PROXIMITY_DISTANCE;
    const nearby: typeof nearbyPoints = [];

    for (let i = 0; i < space.points.length; i++) {
      const p = space.points[i]!;
      const dx = p.pos[0] - cx;
      const dy = p.pos[1] - cy;
      const dz = p.pos[2] - cz;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < threshold) {
        nearby.push({ term: p.term, pos: p.pos, dist: Math.sqrt(distSq) });
        if (nearby.length > MAX_PROXIMITY_LABELS * 2) break;
      }
    }

    nearby.sort((a, b) => a.dist - b.dist);
    const limited = nearby.slice(0, MAX_PROXIMITY_LABELS);

    const changed =
      limited.length !== nearbyPoints.length ||
      limited.some((p, i) => p.term !== nearbyPoints[i]?.term);
    if (changed) setNearbyPoints(limited);
  });

  // User embed hover label (highest priority)
  if (hoveredUserEmbed) {
    return (
      <Html
        position={hoveredUserEmbed.pos}
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="rounded-md bg-black/80 px-3 py-1.5 text-sm text-white backdrop-blur-sm whitespace-nowrap">
          <div className="font-medium">{hoveredUserEmbed.label}</div>
          <div className="text-xs text-amber-300/70">User Embed</div>
        </div>
      </Html>
    );
  }

  return (
    <>
      {/* Hovered point label */}
      {hoveredPoint && space && (
        <Html
          position={hoveredPoint.pos}
          distanceFactor={10}
          style={{ pointerEvents: 'none' }}
        >
          <div className="rounded-md bg-black/80 px-3 py-1.5 text-sm text-white backdrop-blur-sm whitespace-nowrap">
            <div className="font-medium">{hoveredPoint.term}</div>
            {(() => {
              const cluster = space.clusters.find((c) => c.id === hoveredPoint.cluster);
              return cluster ? (
                <div className="text-xs text-white/50">{cluster.label}</div>
              ) : null;
            })()}
          </div>
        </Html>
      )}

      {/* Proximity labels */}
      {nearbyPoints.map((p) => {
        if (hoveredPoint && p.term === hoveredPoint.term) return null;
        const opacity = Math.max(0.2, 1 - p.dist / PROXIMITY_DISTANCE);
        return (
          <Html
            key={p.term}
            position={p.pos}
            distanceFactor={10}
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="whitespace-nowrap text-xs text-white select-none"
              style={{ opacity }}
            >
              {p.term}
            </div>
          </Html>
        );
      })}
    </>
  );
}
