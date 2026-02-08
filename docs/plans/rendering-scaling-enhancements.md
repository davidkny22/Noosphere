# Noosphere — Rendering & Scaling Enhancements

## Context

Phase 0 is complete: 10K-point 3D spaces render with orbit controls, search, fly-to, and space switching. But the rendering approach (InstancedMesh with 48-triangle spheres = 480K triangles for 10K points) won't scale to 100K. The fog and point sizing are hardcoded constants that break when vocabulary size changes. And the initial load gives no spatial context — users don't immediately understand they're in 3D.

These four changes fix the scaling foundation before any new features are added.

---

## 1. GL_POINTS Renderer (replace PointCloud.tsx)

**Problem:** InstancedMesh with `sphereGeometry(0.15, 8, 6)` produces 48 triangles per point. At 10K = 480K triangles. At 100K = 4.8M triangles. GL_POINTS renders each point as a single vertex — 100K vertices, one draw call.

**Approach:** Replace the `<instancedMesh>` in `PointCloud.tsx` with a `THREE.Points` object using custom `ShaderMaterial`. The component's external API (click, hover, color updates via store) stays identical.

**File:** `web/src/components/PointCloud.tsx` (rewrite)

**Vertex shader:**
```glsl
attribute vec3 color;
attribute float scaleFactor;

varying vec3 vColor;

uniform float pointSize;

// Three.js fog support
#include <fog_pars_vertex>

void main() {
  vColor = color;
  vec4 cameraSpacePos = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * cameraSpacePos;

  // Size attenuation: inversely proportional to distance from camera
  float outputPointSize = -pointSize / cameraSpacePos.z;
  gl_PointSize = max(outputPointSize * scaleFactor, 3.0);

  #include <fog_vertex>
}
```

**Fragment shader:**
```glsl
varying vec3 vColor;

#include <common>
#include <fog_pars_fragment>

void main() {
  // Circle clipping — discard pixels outside the point's circle
  vec2 center = gl_PointCoord - vec2(0.5);
  if (dot(center, center) > 0.25) discard;

  gl_FragColor = vec4(vColor, 1.0);

  #include <fog_fragment>
}
```

**Buffer setup:**
- `position`: `Float32Array(N * 3)` — directly from `space.points[i].pos`
- `color`: `Float32Array(N * 3)` — from `computeColors()`
- `scaleFactor`: `Float32Array(N)` — 1.0 default, 2.0 for highlighted, 0.6 for dimmed

**Hover/click:** R3F's raycaster works with `THREE.Points` via `raycaster.params.Points.threshold`. Set threshold to match visual point radius. The `onPointerOver` event gives `event.index` (not `event.instanceId`). Same store flow.

**Point size uniform:** Computed via inverse-log formula (see item 3 below), passed as uniform.

**Color updates:** On search highlight or color mode change, update the `color` buffer attribute's array and set `needsUpdate = true`. Same pattern as current InstancedMesh color updates but simpler — no `setColorAt` loop, just copy the Float32Array directly.

**Scale updates:** On highlight, update `scaleFactor` buffer: 2.0 for highlighted points, 0.6 for dimmed, 1.0 for default. Set `needsUpdate = true`.

---

## 2. Auto-Orbit on Load

**Problem:** When a space loads, the camera sits static at `[0, 0, 80]`. Users don't immediately understand they're looking at 3D data.

**Approach:** Add auto-orbit to `CameraAnimator.tsx`. When a space loads, enable `autoRotate` on OrbitControls. Stop on first user interaction.

**File:** `web/src/components/CameraAnimator.tsx` (extend)

**Implementation:**
- Add `orbitOnLoad` ref (boolean, starts `true`)
- In `useEffect` watching `space`, when a new space loads and `flyToState === 'idle'`, set OrbitControls `autoRotate = true`, `autoRotateSpeed = 1.0` (one rotation per ~60 seconds, gentle)
- Listen for `pointerdown` or `wheel` on the canvas. On first interaction, set `autoRotate = false` and `orbitOnLoad = false`
- When switching spaces (`spaceUrl` changes), reset `orbitOnLoad = true` so the new space also auto-orbits
- Access OrbitControls via `useThree().controls` (already `makeDefault`)

**Constants:**
- `AUTO_ROTATE_SPEED = 1.0` — gentle, not disorienting

---

## 3. Point Size Inverse-Log Scaling

**Problem:** `POINT_RADIUS = 0.15` is hardcoded. Works for 10K, too big for 100K, too small for 1K.

**Approach:** Compute point size from point count using the TF projector's formula: `SCALE / log(n) / log(LOG_BASE)`.

**File:** `web/src/components/PointCloud.tsx` (in the rewritten GL_POINTS version)

**Formula:**
```typescript
const SCALE = 200;
const LOG_BASE = 8;
const pointSize = SCALE / Math.log(n) / Math.log(LOG_BASE);
```

At 10K: `200 / 9.21 / 2.08 = ~10.4`
At 100K: `200 / 11.51 / 2.08 = ~8.4`
At 1K: `200 / 6.91 / 2.08 = ~13.9`

This is passed as the `pointSize` uniform to the vertex shader. The shader then applies size attenuation (`-pointSize / cameraSpacePos.z`) so points shrink with distance.

---

## 4. Fog Scaling with Point Count

**Problem:** Fog near/far are hardcoded `60/200`. Dense datasets need more fog (distant points are noise), sparse datasets need less (every point matters).

**Approach:** Compute fog far dynamically from point count and actual coordinate extent.

**File:** `web/src/components/SpaceCanvas.tsx` (modify fog setup)

**Formula** (from TF projector):
```typescript
const NUM_POINTS_FOG_THRESHOLD = 5000;
const multiplier = 2 - Math.min(n, NUM_POINTS_FOG_THRESHOLD) / NUM_POINTS_FOG_THRESHOLD;
const fogFar = farthestPointDistance * multiplier;
```

At 10K points (above threshold): `multiplier = 2 - 1 = 1`, so `fogFar = farthestPointDistance` — tight fog
At 1K points: `multiplier = 2 - 0.2 = 1.8`, so `fogFar = 1.8 * farthestPointDistance` — loose fog

**`farthestPointDistance`:** Compute from the space data. Find the max distance from origin across all points: `Math.max(...points.map(p => Math.sqrt(p.pos[0]² + p.pos[1]² + p.pos[2]²)))`. Cache in a `useMemo`.

**Fog near:** Set to `farthestPointDistance * 0.3` — points start fading at ~30% of the max range.

---

## Build Order

1. **GL_POINTS renderer** — rewrite `PointCloud.tsx` with `THREE.Points` + custom shaders. Include point size formula inline. Verify click/hover still work, colors still update on search.
2. **Fog scaling** — update `SpaceCanvas.tsx` to compute fog from point count + coordinate extent.
3. **Auto-orbit** — extend `CameraAnimator.tsx`. Quick addition.
4. **Verify** — test with both MiniLM and Qwen3 spaces. Toggle stats (`` ` ``) to confirm frame rate. Search, fly-to, space switching should all still work.

## Files Modified

| File | Change |
|------|--------|
| `web/src/components/PointCloud.tsx` | Rewrite: InstancedMesh → THREE.Points + ShaderMaterial |
| `web/src/components/SpaceCanvas.tsx` | Dynamic fog computation from point count + extent |
| `web/src/components/CameraAnimator.tsx` | Add auto-orbit on load |

## Verification

- `npm run dev` — no console errors
- 10K colored points render as circles (not squares — fragment shader circle clipping works)
- Hover → cursor changes, tooltip appears
- Click → InfoPanel opens
- Search → highlighted points brighten + scale up, others dim + shrink
- Fly-to → camera animates smoothly
- Space switch → loading screen, new space renders, auto-orbit starts
- `` ` `` → Stats panel shows frame time < 16.6ms
- On initial load, camera gently orbits; mouse/scroll stops it
