import { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { PointCloud } from './PointCloud';
import { PointLabel } from './PointLabel';
import { ClusterLabels } from './ClusterLabels';
import { CameraAnimator } from './CameraAnimator';
import { ScrollZoom } from './ScrollZoom';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { NeighborLines } from './NeighborLines';
import { BiasLines } from './BiasLines';
import { ProjectedMarker } from './ProjectedMarker';
import { UserEmbedPoints } from './UserEmbedPoints';
import { IntroAnimation } from './IntroAnimation';
import { ComparisonMarkers } from './ComparisonMarkers';
import { AnalogyMarkers } from './AnalogyMarkers';
import { Breadcrumbs } from './Breadcrumbs';
import { FlyControls } from './FlyControls';
import { DistanceLegendUpdater } from './DistanceLegend';
import { DistanceRings } from './DistanceRings';
import { CameraLight } from './CameraLight';
import { useSpaceStore } from '../store/useSpaceStore';

const FOG_COLOR = '#0a0a0a';
const NUM_POINTS_FOG_THRESHOLD = 50000;

export function SpaceCanvas() {
  const space = useSpaceStore((s) => s.space);
  const spaceScale = useSpaceStore((s) => s.spaceScale);
  const controlMode = useSpaceStore((s) => s.controlMode);
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

    // multiplier: 1.0 for dense (>=50K), up to 2.0 for sparse (<50K)
    const multiplier = 2 - Math.min(n, NUM_POINTS_FOG_THRESHOLD) / NUM_POINTS_FOG_THRESHOLD;
    // Tighter fog for very large spaces so it's not a solid wall
    const isLarge = n > 50000;
    return {
      fogNear: isLarge ? maxDist * 0.3 : maxDist * 1.2,
      fogFar: isLarge ? maxDist * 3.0 : maxDist * 4 * multiplier,
    };
  }, [space]);

  if (!space) return null;

  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [0, 0, 80], fov: 60, near: 0.1, far: 1500 }}
        gl={{ antialias: true }}
        style={{ background: FOG_COLOR }}
      >
        <fog attach="fog" args={[FOG_COLOR, fogNear * spaceScale, fogFar * spaceScale]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[50, 50, 50]} intensity={0.5} />
        <directionalLight position={[-50, -30, -50]} intensity={0.2} />
        <CameraLight />
        <group scale={[spaceScale, spaceScale, spaceScale]}>
          <PointCloud />
          <UserEmbedPoints />
          <NeighborLines />
          <BiasLines />
          <ProjectedMarker />
          <ComparisonMarkers />
          <AnalogyMarkers />
          <Breadcrumbs />
          <DistanceRings />
          <PointLabel />
          <ClusterLabels />
        </group>
        <CameraAnimator />
        <OrbitControls
          makeDefault
          enabled={controlMode === 'orbit'}
          enableDamping={false}
          rotateSpeed={0.6}
          panSpeed={0.7}
          minDistance={0}
          maxDistance={500}
          enableZoom={false}
        />
        <IntroAnimation />
        <ScrollZoom />
        <FlyControls />
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.8}
            luminanceSmoothing={0.3}
            intensity={0.6}
            radius={0.4}
          />
        </EffectComposer>
        <DistanceLegendUpdater />
        {showStats && <Stats />}
      </Canvas>
    </div>
  );
}
