import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';
import { computeColors, buildClusterPalette } from '../systems/colorSystem';

const POINT_RADIUS = 0.15;
const POINT_WIDTH_SEGMENTS = 8;
const POINT_HEIGHT_SEGMENTS = 6;

export function PointCloud() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const space = useSpaceStore((s) => s.space);
  const colorMode = useSpaceStore((s) => s.colorMode);
  const highlightedIndices = useSpaceStore((s) => s.highlightedIndices);

  const palette = useMemo(() => {
    if (!space) return new Map<number, [number, number, number]>();
    return buildClusterPalette(space.clusters);
  }, [space]);

  // Initialize instance matrices and colors
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !space) return;

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    const colors = computeColors(space.points, space.clusters, colorMode, {
      clusterPalette: palette,
      highlightedIndices: highlightedIndices.size > 0 ? highlightedIndices : undefined,
    });

    for (let i = 0; i < space.points.length; i++) {
      const point = space.points[i]!;
      matrix.setPosition(point.pos[0], point.pos[1], point.pos[2]);
      mesh.setMatrixAt(i, matrix);

      color.setRGB(colors[i * 3]!, colors[i * 3 + 1]!, colors[i * 3 + 2]!);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [space, palette, colorMode, highlightedIndices]);

  // Handle hover
  const handlePointerOver = (e: { instanceId?: number; stopPropagation: () => void }) => {
    if (e.instanceId == null || !space) return;
    e.stopPropagation();
    const point = space.points[e.instanceId];
    if (point) {
      useSpaceStore.getState().hoverPoint(point, e.instanceId);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    useSpaceStore.getState().hoverPoint(null, null);
    document.body.style.cursor = 'auto';
  };

  // Handle click
  const handleClick = (e: { instanceId?: number; stopPropagation: () => void }) => {
    if (e.instanceId == null || !space) return;
    e.stopPropagation();
    const point = space.points[e.instanceId];
    if (point) {
      useSpaceStore.getState().selectPoint(point);
    }
  };

  // Click on background deselects
  const handlePointerMissed = () => {
    useSpaceStore.getState().selectPoint(null);
  };

  if (!space) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, space.points.length]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerMissed={handlePointerMissed}
    >
      <sphereGeometry args={[POINT_RADIUS, POINT_WIDTH_SEGMENTS, POINT_HEIGHT_SEGMENTS]} />
      <meshStandardMaterial toneMapped={false} />
    </instancedMesh>
  );
}
