import { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { PointCloud } from './PointCloud';
import { PointLabel } from './PointLabel';
import { ClusterLabels } from './ClusterLabels';
import { CameraAnimator } from './CameraAnimator';
import { ScrollZoom } from './ScrollZoom';
import { NeighborLines } from './NeighborLines';
import { useSpaceStore } from '../store/useSpaceStore';

const FOG_COLOR = '#0a0a0a';
const NUM_POINTS_FOG_THRESHOLD = 5000;

export function SpaceCanvas() {
  const space = useSpaceStore((s) => s.space);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '`') setShowStats((s) => !s);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Dynamic fog from point count + coordinate extent
  // Fog distances are measured from the camera, not the origin.
  // Camera starts at z=80 and the data is centered at origin with radius ~maxDist.
  // We scale fog so dense datasets get tighter fog and sparse ones get looser fog.
  const { fogNear, fogFar } = useMemo(() => {
    if (!space) return { fogNear: 60, fogFar: 200 };

    const n = space.points.length;
    let maxDist = 0;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = space.points[i]!.pos;
      const dist = Math.sqrt(x * x + y * y + z * z);
      if (dist > maxDist) maxDist = dist;
    }

    // multiplier: 1.0 for dense (>=5K), up to 2.0 for sparse (<5K)
    const multiplier = 2 - Math.min(n, NUM_POINTS_FOG_THRESHOLD) / NUM_POINTS_FOG_THRESHOLD;
    return {
      fogNear: maxDist * 1.5,
      fogFar: maxDist * 5 * multiplier,
    };
  }, [space]);

  if (!space) return null;

  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [0, 0, 80], fov: 60, near: 0.1, far: 500 }}
        gl={{ antialias: true }}
        style={{ background: FOG_COLOR }}
      >
        <fog attach="fog" args={[FOG_COLOR, fogNear, fogFar]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[50, 50, 50]} intensity={0.6} />
        <directionalLight position={[-50, -30, -50]} intensity={0.3} />
        <PointCloud />
        <NeighborLines />
        <PointLabel />
        <ClusterLabels />
        <CameraAnimator />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.6}
          panSpeed={0.7}
          minDistance={0}
          maxDistance={500}
          enableZoom={false}
        />
        <ScrollZoom />
        {showStats && <Stats />}
      </Canvas>
    </div>
  );
}
