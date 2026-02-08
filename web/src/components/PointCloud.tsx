import { useRef, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';
import { computeColors, buildClusterPalette } from '../systems/colorSystem';

// Inverse-log point sizing (TF projector formula)
// pointSize is a diameter in world-ish units; vertex shader converts to screen pixels
// via (pointSize * SCREEN_SCALE / distance). SCREEN_SCALE=300 matches TF projector.
const POINT_SIZE_SCALE = 200;
const POINT_SIZE_LOG_BASE = 8;
const SCREEN_SCALE = 40.0;

const vertexShader = /* glsl */ `
attribute vec3 color;
attribute float scaleFactor;

varying vec3 vColor;

uniform float pointSize;
uniform float screenScale;

#include <fog_pars_vertex>

void main() {
  vColor = color;
  vec4 cameraSpacePos = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * cameraSpacePos;

  float dist = length(cameraSpacePos.xyz);
  float outputPointSize = pointSize * screenScale / dist;
  gl_PointSize = max(outputPointSize * scaleFactor, 2.0);

  vec4 mvPosition = cameraSpacePos;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;

#include <common>
#include <fog_pars_fragment>

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  if (dot(center, center) > 0.25) discard;

  gl_FragColor = vec4(vColor, 1.0);

  #include <fog_fragment>
}
`;

export function PointCloud() {
  const pointsRef = useRef<THREE.Points>(null);
  const space = useSpaceStore((s) => s.space);
  const colorMode = useSpaceStore((s) => s.colorMode);
  const highlightedIndices = useSpaceStore((s) => s.highlightedIndices);
  const { raycaster } = useThree();

  const palette = useMemo(() => {
    if (!space) return new Map<number, [number, number, number]>();
    return buildClusterPalette(space.clusters);
  }, [space]);

  // Compute point size from point count
  const pointSize = useMemo(() => {
    if (!space) return 10;
    const n = space.points.length;
    return POINT_SIZE_SCALE / Math.log(n) / Math.log(POINT_SIZE_LOG_BASE);
  }, [space]);

  // Build geometry buffers
  const geometry = useMemo(() => {
    if (!space) return null;
    const n = space.points.length;
    const positions = new Float32Array(n * 3);
    const scaleFactors = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const pos = space.points[i]!.pos;
      positions[i * 3] = pos[0];
      positions[i * 3 + 1] = pos[1];
      positions[i * 3 + 2] = pos[2];
      scaleFactors[i] = 1.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('scaleFactor', new THREE.BufferAttribute(scaleFactors, 1));
    // Color attribute will be set in the color update effect
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return geo;
  }, [space]);

  // Update colors and scale factors when highlights/mode change
  useEffect(() => {
    if (!geometry || !space) return;

    const colors = computeColors(space.points, space.clusters, colorMode, {
      clusterPalette: palette,
      highlightedIndices: highlightedIndices.size > 0 ? highlightedIndices : undefined,
    });

    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    (colorAttr.array as Float32Array).set(colors);
    colorAttr.needsUpdate = true;

    // Update scale factors based on highlight state
    const scaleAttr = geometry.getAttribute('scaleFactor') as THREE.BufferAttribute;
    const scales = scaleAttr.array as Float32Array;

    if (highlightedIndices.size > 0) {
      for (let i = 0; i < space.points.length; i++) {
        scales[i] = highlightedIndices.has(i) ? 2.0 : 0.6;
      }
    } else {
      scales.fill(1.0);
    }
    scaleAttr.needsUpdate = true;
  }, [geometry, space, palette, colorMode, highlightedIndices]);

  // Set raycaster threshold for point picking
  useEffect(() => {
    raycaster.params.Points = { threshold: 0.5 };
  }, [raycaster]);

  // Handle hover
  const handlePointerOver = (e: THREE.Intersection & { stopPropagation: () => void }) => {
    const index = (e as unknown as { index?: number }).index;
    if (index == null || !space) return;
    e.stopPropagation();
    const point = space.points[index];
    if (point) {
      useSpaceStore.getState().hoverPoint(point, index);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    useSpaceStore.getState().hoverPoint(null, null);
    document.body.style.cursor = 'auto';
  };

  // Handle click
  const handleClick = (e: THREE.Intersection & { stopPropagation: () => void }) => {
    const index = (e as unknown as { index?: number }).index;
    if (index == null || !space) return;
    e.stopPropagation();
    const point = space.points[index];
    if (point) {
      useSpaceStore.getState().selectPoint(point);
    }
  };

  // Click on background deselects
  const handlePointerMissed = () => {
    useSpaceStore.getState().selectPoint(null);
  };

  // Merge fog uniforms with custom uniforms so Three.js can update them
  const uniforms = useMemo(
    () =>
      THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          pointSize: { value: pointSize },
          screenScale: { value: SCREEN_SCALE },
        },
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Keep pointSize uniform in sync
  useEffect(() => {
    uniforms.pointSize.value = pointSize;
  }, [pointSize, uniforms]);

  if (!space || !geometry) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerMissed={handlePointerMissed}
    >
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        fog
        transparent={false}
      />
    </points>
  );
}
