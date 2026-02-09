import { useMemo } from 'react';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';
import { buildClusterPalette } from '../systems/colorSystem';

function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.15)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function ClusterFog() {
  const space = useSpaceStore((s) => s.space);

  const glowTexture = useMemo(() => createGlowTexture(), []);

  const palette = useMemo(() => {
    if (!space) return new Map<number, [number, number, number]>();
    return buildClusterPalette(space.clusters);
  }, [space]);

  if (!space) return null;

  return (
    <>
      {space.clusters.map((cluster) => {
        const radius = Math.sqrt(cluster.size) * 0.15;
        const rgb = palette.get(cluster.id);
        const clusterColor = rgb
          ? new THREE.Color(rgb[0], rgb[1], rgb[2])
          : new THREE.Color(1, 1, 1);

        return (
          <sprite
            key={cluster.id}
            position={cluster.centroid}
            scale={[radius * 3, radius * 3, 1]}
          >
            <spriteMaterial
              map={glowTexture}
              transparent
              opacity={Math.min(0.03 * Math.log(cluster.size + 1), 0.12)}
              blending={THREE.AdditiveBlending}
              fog={false}
              depthWrite={false}
              color={clusterColor}
            />
          </sprite>
        );
      })}
    </>
  );
}
