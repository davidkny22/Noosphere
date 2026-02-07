import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { PointCloud } from './PointCloud';
import { useSpaceStore } from '../store/useSpaceStore';

const FOG_COLOR = '#0a0a0a';
const FOG_NEAR = 60;
const FOG_FAR = 200;

export function SpaceCanvas() {
  const space = useSpaceStore((s) => s.space);

  if (!space) return null;

  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [0, 0, 80], fov: 60, near: 0.1, far: 500 }}
        gl={{ antialias: true }}
        style={{ background: FOG_COLOR }}
      >
        <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[50, 50, 50]} intensity={0.6} />
        <directionalLight position={[-50, -30, -50]} intensity={0.3} />
        <PointCloud />
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={300}
        />
        <Stats />
      </Canvas>
    </div>
  );
}
