import { Billboard, Text } from '@react-three/drei';
import { useSpaceStore } from '../store/useSpaceStore';

const FONT_SIZE = 1.0; // world units — scales naturally with camera distance

export function ClusterLabels() {
  const space = useSpaceStore((s) => s.space);
  const introState = useSpaceStore((s) => s.introState);

  if (!space || introState !== 'done') return null;

  return (
    <>
      {space.clusters.map((cluster) => (
        <Billboard key={cluster.id} position={cluster.centroid} follow lockX={false} lockY={false} lockZ={false}>
          <Text
            fontSize={FONT_SIZE}
            color="white"
            anchorX="center"
            anchorY="middle"
            fillOpacity={0.4}
            outlineWidth={0.05}
            outlineColor="black"
            outlineOpacity={0.3}
            {...{ fog: true } as Record<string, unknown>}
          >
            {cluster.label}
          </Text>
        </Billboard>
      ))}
    </>
  );
}
