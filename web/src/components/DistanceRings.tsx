import { useSpaceStore } from '../store/useSpaceStore';

const RINGS = [
  { radius: 5, color: '#22c55e', label: 'Close neighbors' },   // green
  { radius: 20, color: '#f59e0b', label: 'Related' },           // amber
  { radius: 50, color: '#ef4444', label: 'Weakly related' },    // red
] as const;

export function DistanceRings() {
  const selectedPoint = useSpaceStore((s) => s.selectedPoint);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);
  const spaceScale = useSpaceStore((s) => s.spaceScale);

  if (!selectedPoint || !isAdvancedMode) return null;

  const [x, y, z] = selectedPoint.pos;

  return (
    <group position={[x, y, z]}>
      {RINGS.map((ring) => (
        <mesh key={ring.radius} scale={[1 / spaceScale, 1 / spaceScale, 1 / spaceScale]}>
          <sphereGeometry args={[ring.radius, 32, 16]} />
          <meshBasicMaterial
            wireframe
            transparent
            opacity={0.06}
            color={ring.color}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  );
}
