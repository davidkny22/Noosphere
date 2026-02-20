import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';
import { computeColors, buildClusterPalette } from '../systems/colorSystem';
import { useGpuPicking, buildPickingColors } from '../hooks/useGpuPicking';

const DRAG_THRESHOLD_PX = 3;

// Inverse-log point sizing (TF projector formula)
// pointSize is a diameter in world-ish units; vertex shader converts to screen pixels
// via (pointSize * SCREEN_SCALE / distance). SCREEN_SCALE=300 matches TF projector.
const POINT_SIZE_SCALE = 200;
const POINT_SIZE_LOG_BASE = 8;
const SCREEN_SCALE = 48.0;

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
  float r2 = dot(center, center);

  // Dark halo shadow ring just outside the point body
  // Point body fills r2 < 0.16 (r < 0.4), halo extends to r2 < 0.25 (r = 0.5)
  if (r2 > 0.25) discard;

  float outerR = sqrt(r2) * 2.27; // normalized: 0 center, 1 at body edge (r=0.44)
  if (r2 > 0.19) {
    // Thin halo band between body edge and sprite edge
    float haloFade = (sqrt(r2) - 0.44) / 0.06; // 0 at body edge, 1 at sprite edge
    float haloAlpha = (1.0 - haloFade) * 0.35;
    gl_FragColor = vec4(0.0, 0.0, 0.0, haloAlpha);
    #include <fog_fragment>
    return;
  }

  // Sphere shading with smooth falloff
  float r = outerR;
  float r3 = r * r * r; // cubic falloff for smoother gradient
  float diffuse = 1.0 - r3 * 0.65; // darkens toward edges, bright center plateau

  // Soft specular highlight offset toward top-left (light direction)
  float specDist = length(center - vec2(-0.1, -0.1));
  float spec = smoothstep(0.25, 0.0, specDist); // smooth falloff

  // Rim darkening for depth
  float rim = smoothstep(0.25, 0.4, sqrt(r2));

  vec3 shaded = vColor * diffuse * (1.0 - rim * 0.4) + vec3(1.0) * spec * 0.25;
  gl_FragColor = vec4(shaded, 1.0);

  #include <fog_fragment>
}
`;

export function PointCloud() {
  const pointsRef = useRef<THREE.Points>(null);
  const space = useSpaceStore((s) => s.space);
  const colorMode = useSpaceStore((s) => s.colorMode);
  const highlightedIndices = useSpaceStore((s) => s.highlightedIndices);
  const neighborIndices = useSpaceStore((s) => s.neighborIndices);
  const neighborCenter = useSpaceStore((s) => s.neighborCenter);
  const biasScores = useSpaceStore((s) => s.biasScores);
  const pulseIndex = useSpaceStore((s) => s.pulseIndex);
  const { gl } = useThree();
  const pulseTime = useRef(0);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const palette = useMemo(() => {
    if (!space) return new Map<number, [number, number, number]>();
    return buildClusterPalette(space.clusters);
  }, [space]);

  // Compute point size from point count — smaller for large spaces
  const pointSize = useMemo(() => {
    if (!space) return 10;
    const n = space.points.length;
    return POINT_SIZE_SCALE / Math.log(n) / Math.log(POINT_SIZE_LOG_BASE);
  }, [space]);

  // Build geometry buffers (including pickingColor for GPU picking)
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
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('pickingColor', new THREE.BufferAttribute(buildPickingColors(n), 3));
    return geo;
  }, [space]);

  // GPU picking — O(1) hover detection via offscreen color-ID render
  const pickedIndex = useGpuPicking(pointsRef, pointSize, SCREEN_SCALE);

  // Track pointer-down position for click vs drag discrimination
  useEffect(() => {
    const canvas = gl.domElement;
    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
    };
    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => canvas.removeEventListener('pointerdown', handlePointerDown);
  }, [gl]);

  const wasDrag = useCallback((e: MouseEvent) => {
    if (!pointerDownPos.current) return false;
    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    return Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX;
  }, []);

  // Click handling via canvas DOM event (uses GPU-picked index, not raycasting)
  useEffect(() => {
    const canvas = gl.domElement;
    const handleClick = (e: MouseEvent) => {
      if (wasDrag(e)) return;
      const idx = pickedIndex.current;
      if (idx != null && space?.points[idx]) {
        useSpaceStore.getState().selectPoint(space.points[idx]);
      } else {
        // Clicked on background — deselect, clear neighborhood and highlights
        const store = useSpaceStore.getState();
        store.selectPoint(null);
        if (store.highlightedIndices.size > 0) {
          store.setHighlightedIndices(new Set());
        }
        if (store.neighborCenter != null) {
          store.setNeighborhood(null, []);
        }
        if (store.colorMode !== 'cluster') {
          store.setColorMode('cluster');
        }
      }
    };
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [gl, space, wasDrag, pickedIndex]);

  // Update colors and scale factors when highlights/mode change
  useEffect(() => {
    if (!geometry || !space) return;

    const colors = computeColors(space.points, space.clusters, colorMode, {
      clusterPalette: palette,
      highlightedIndices: highlightedIndices.size > 0 ? highlightedIndices : undefined,
      neighborIndices,
      neighborCenter,
      biasScores: biasScores.length > 0 ? biasScores : undefined,
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
  }, [geometry, space, palette, colorMode, highlightedIndices, neighborIndices, neighborCenter, biasScores]);

  // Reset pulse timer when a new pulse starts
  useEffect(() => {
    if (pulseIndex != null) pulseTime.current = 0;
  }, [pulseIndex]);

  // Animate pulsing point scale
  const PULSE_DURATION = 4.0;
  const PULSE_SPEED = 5.0;
  useFrame((_, delta) => {
    if (pulseIndex == null || !geometry) return;
    pulseTime.current += delta;

    if (pulseTime.current > PULSE_DURATION) {
      // Stop pulsing — reset scale to normal
      const scaleAttr = geometry.getAttribute('scaleFactor') as THREE.BufferAttribute;
      (scaleAttr.array as Float32Array)[pulseIndex] = 1.0;
      scaleAttr.needsUpdate = true;
      useSpaceStore.getState().setPulseIndex(null);
      return;
    }

    // Sine wave pulse: scale between 1.0 and 4.0
    const wave = Math.sin(pulseTime.current * PULSE_SPEED);
    const scale = 2.5 + 1.5 * wave;

    const scaleAttr = geometry.getAttribute('scaleFactor') as THREE.BufferAttribute;
    (scaleAttr.array as Float32Array)[pulseIndex] = scale;
    scaleAttr.needsUpdate = true;
  });

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
      frustumCulled={false}
    >
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        fog
        transparent
        depthWrite={true}
      />
    </points>
  );
}
