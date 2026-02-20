import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

/**
 * Picking vertex shader — same point sizing as the visual shader,
 * but outputs a unique color ID per point instead of shaded color.
 */
const pickingVS = /* glsl */ `
attribute vec3 pickingColor;
attribute float scaleFactor;
varying vec3 vPickingColor;
uniform float pointSize;
uniform float screenScale;

void main() {
  vPickingColor = pickingColor;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPos;
  float dist = length(mvPos.xyz);
  gl_PointSize = max(pointSize * screenScale / dist * scaleFactor, 2.0);
}
`;

/** Picking fragment — circular discard matching the visual shader, flat color ID output. */
const pickingFS = /* glsl */ `
varying vec3 vPickingColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vPickingColor, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Module-level bridge for rectangle picking (used by RectangleSelector)
// ---------------------------------------------------------------------------
let _bridge: {
  gl: THREE.WebGLRenderer;
  camera: THREE.Camera;
  target: THREE.WebGLRenderTarget;
  material: THREE.ShaderMaterial;
  scene: THREE.Scene;
  pickPoints: THREE.Points;
  src: THREE.Points;
  pointSize: number;
  screenScale: number;
} | null = null;

function renderPickingPass(b: typeof _bridge) {
  if (!b) return;
  const { gl, camera, target, material, scene, pickPoints, src, pointSize, screenScale } = b;

  // Sync geometry
  if (pickPoints.geometry !== src.geometry) {
    pickPoints.geometry = src.geometry;
  }

  // Sync transforms
  src.updateWorldMatrix(true, false);
  pickPoints.matrix.copy(src.matrixWorld);
  pickPoints.matrixWorld.copy(src.matrixWorld);

  // Sync uniforms
  material.uniforms.pointSize.value = pointSize;
  material.uniforms.screenScale.value = screenScale;

  // Render
  const prevTarget = gl.getRenderTarget();
  const prevClear = new THREE.Color();
  gl.getClearColor(prevClear);
  const prevAlpha = gl.getClearAlpha();

  gl.setRenderTarget(target);
  gl.setClearColor(0x000000, 0);
  gl.clear();
  gl.render(scene, camera);

  gl.setRenderTarget(prevTarget);
  gl.setClearColor(prevClear, prevAlpha);
}

/**
 * Read a rectangular region from the picking texture and return all unique
 * point indices found. Used by RectangleSelector for shift+drag selection.
 *
 * @param cssRect Rectangle in CSS pixels relative to the canvas element.
 */
export function pickRectangle(cssRect: { x: number; y: number; w: number; h: number }): Set<number> {
  if (!_bridge) return new Set();

  const { gl, target } = _bridge;

  // Force a fresh picking render
  renderPickingPass(_bridge);

  const dpr = gl.getPixelRatio();
  const canvasH = gl.domElement.clientHeight;

  // Convert CSS pixels → device pixels, flip Y for WebGL
  const x = Math.round(cssRect.x * dpr);
  const y = Math.round((canvasH - cssRect.y - cssRect.h) * dpr);
  const w = Math.max(1, Math.round(cssRect.w * dpr));
  const h = Math.max(1, Math.round(cssRect.h * dpr));

  // Clamp to render target bounds
  const tw = target.width;
  const th = target.height;
  const cx = Math.max(0, Math.min(x, tw - 1));
  const cy = Math.max(0, Math.min(y, th - 1));
  const cw = Math.min(w, tw - cx);
  const ch = Math.min(h, th - cy);

  if (cw <= 0 || ch <= 0) return new Set();

  const pixels = new Uint8Array(cw * ch * 4);
  gl.readRenderTargetPixels(target, cx, cy, cw, ch, pixels);

  const indices = new Set<number>();
  for (let i = 0; i < cw * ch; i++) {
    const off = i * 4;
    const id = (pixels[off] << 16) | (pixels[off + 1] << 8) | pixels[off + 2];
    if (id > 0) indices.add(id - 1);
  }

  return indices;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * GPU-based O(1) point picking via offscreen color-ID rendering.
 *
 * Each point is encoded as (index + 1) in RGB, so background (0,0,0) = no point.
 * Supports up to ~16.7M points. On every frame where the mouse has moved,
 * renders the picking scene to an offscreen target and reads the pixel under
 * the cursor to determine the hovered point index.
 *
 * Directly updates the Zustand store for hover state, and exposes the picked
 * index ref for click handling by the parent component.
 */
export function useGpuPicking(
  pointsRef: React.RefObject<THREE.Points | null>,
  pointSize: number,
  screenScale: number,
): React.RefObject<number | null> {
  const { gl, camera } = useThree();

  const targetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const pickPointsRef = useRef<THREE.Points | null>(null);
  const pixel = useRef(new Uint8Array(4));
  const mouse = useRef({ x: -1, y: -1, dirty: false });
  const pickedIndex = useRef<number | null>(null);
  const lastReported = useRef<number | null>(null);

  // Create render target + picking material
  useEffect(() => {
    const w = gl.domElement.width || 1;
    const h = gl.domElement.height || 1;
    const scene = sceneRef.current;

    targetRef.current = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    materialRef.current = new THREE.ShaderMaterial({
      vertexShader: pickingVS,
      fragmentShader: pickingFS,
      uniforms: {
        pointSize: { value: pointSize },
        screenScale: { value: screenScale },
      },
    });

    return () => {
      _bridge = null;
      targetRef.current?.dispose();
      materialRef.current?.dispose();
      if (pickPointsRef.current) {
        scene.remove(pickPointsRef.current);
        pickPointsRef.current = null;
      }
      targetRef.current = null;
      materialRef.current = null;
    };
  }, [gl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track mouse in device pixels (WebGL Y-up)
  useEffect(() => {
    const canvas = gl.domElement;
    const dpr = gl.getPixelRatio();
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = (e.clientX - rect.left) * dpr;
      mouse.current.y = (rect.bottom - e.clientY) * dpr;
      mouse.current.dirty = true;
    };
    const onLeave = () => {
      mouse.current.dirty = false;
      pickedIndex.current = null;
      if (lastReported.current !== null) {
        lastReported.current = null;
        useSpaceStore.getState().hoverPoint(null, null);
        document.body.style.cursor = 'auto';
      }
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [gl]);

  // Resize render target when canvas resizes
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (targetRef.current) {
        targetRef.current.setSize(
          gl.domElement.width || 1,
          gl.domElement.height || 1,
        );
      }
    });
    observer.observe(gl.domElement);
    return () => observer.disconnect();
  }, [gl]);

  // Picking pass — at most once per frame, only when mouse moved
  useFrame(() => {
    if (!pointsRef.current || !targetRef.current || !materialRef.current) return;

    const src = pointsRef.current;

    // Lazy-create picking Points (shares geometry with the real Points)
    if (!pickPointsRef.current || pickPointsRef.current.geometry !== src.geometry) {
      if (pickPointsRef.current) sceneRef.current.remove(pickPointsRef.current);
      pickPointsRef.current = new THREE.Points(src.geometry, materialRef.current);
      pickPointsRef.current.frustumCulled = false;
      pickPointsRef.current.matrixAutoUpdate = false;
      sceneRef.current.add(pickPointsRef.current);
    }

    // Update bridge for rectangle picking
    _bridge = {
      gl,
      camera,
      target: targetRef.current,
      material: materialRef.current,
      scene: sceneRef.current,
      pickPoints: pickPointsRef.current,
      src,
      pointSize,
      screenScale,
    };

    // Only do single-pixel pick when mouse moved
    if (!mouse.current.dirty) return;
    mouse.current.dirty = false;

    // Render picking pass
    renderPickingPass(_bridge);

    // Read the pixel under the cursor
    gl.readRenderTargetPixels(
      targetRef.current,
      Math.round(mouse.current.x),
      Math.round(mouse.current.y),
      1, 1,
      pixel.current,
    );

    // Decode: RGB encodes (index + 1), so 0 = background
    const id = (pixel.current[0] << 16) | (pixel.current[1] << 8) | pixel.current[2];
    const newIndex = id > 0 ? id - 1 : null;
    pickedIndex.current = newIndex;

    // Update store hover if changed
    if (newIndex !== lastReported.current) {
      lastReported.current = newIndex;
      const store = useSpaceStore.getState();
      const space = store.space;
      if (newIndex != null && space?.points[newIndex]) {
        store.hoverPoint(space.points[newIndex], newIndex);
        document.body.style.cursor = 'pointer';
      } else {
        store.hoverPoint(null, null);
        document.body.style.cursor = 'auto';
      }
    }
  });

  return pickedIndex;
}

/**
 * Build the pickingColor attribute buffer for a given point count.
 * Each point's index is encoded as (index + 1) in RGB channels (0 = background).
 * Supports up to 16,777,214 points.
 */
export function buildPickingColors(numPoints: number): Float32Array {
  const colors = new Float32Array(numPoints * 3);
  for (let i = 0; i < numPoints; i++) {
    const id = i + 1;
    colors[i * 3] = ((id >> 16) & 0xFF) / 255;
    colors[i * 3 + 1] = ((id >> 8) & 0xFF) / 255;
    colors[i * 3 + 2] = (id & 0xFF) / 255;
  }
  return colors;
}
