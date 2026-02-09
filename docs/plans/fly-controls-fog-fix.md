# Fix: Fly Controls, Disappearing Dots, Teleport Scaling + Auto-Select

## Context

Fly mode has three bugs: (1) an invisible wall prevents flying past a certain distance, (2) A/D rotate instead of strafing left/right, and (3) dots disappear at a certain depth into clusters. Root cause: OrbitControls is always active and fights FlyControls, ScrollZoom caps camera at 300 units from origin, and fog hides everything beyond `maxDist * 1.5` from the camera.

Additionally, teleport (flyTo) doesn't account for `spaceScale`, so at 2x/3x the camera flies to the wrong position. And teleporting to a point doesn't auto-select it.

## Changes

### 1. `web/src/components/SpaceCanvas.tsx`
- Read `controlMode` from store
- Set `enabled={controlMode === 'orbit'}` on `<OrbitControls>` — fully disables it in fly mode so it stops fighting WASD translation
- Increase fog far distance for large spaces: `fogFar = maxDist * 3.0` (up from `maxDist * 1.5`)

### 2. `web/src/components/FlyControls.tsx`
- Add mouse-drag rotation: click+drag on canvas controls yaw/pitch via euler angles (YXZ order, pitch clamped to ±90°)
- Mouse events: `mousedown` on canvas, `mousemove`/`mouseup` on window
- Use `useSpaceStore.getState().controlMode` in event handlers (not stale closure)
- WASD remains pure translation (`camera.translateX/Z`), Q/E for up/down

### 3. `web/src/components/ScrollZoom.tsx`
- Skip `MAX_DISTANCE` check when `controlMode === 'fly'` — no distance cap in fly mode

### 4. `web/src/components/PointCloud.tsx`
- Add `frustumCulled={false}` on `<points>` element — safety net against Three.js culling the point mesh at unusual camera positions

### 5. `web/src/components/CameraAnimator.tsx`
- Multiply `flyToTarget` by `spaceScale` to get correct world-space destination (camera is outside the scaled group)
- Scale `OFFSET_DISTANCE` by `spaceScale` so the camera sits back proportionally
- On animation settle: find nearest point to `flyToTarget` (squared distance < 4) and auto-select it via `selectPoint()`

## Verification
- Switch to FLY mode, WASD should translate (A=left, D=right, W=forward, S=backward)
- Mouse click+drag should rotate the camera view
- No invisible wall — can fly past the data and back
- Dots remain visible when flying deep into clusters (fog is looser)
- Switch back to ORBIT mode — orbit controls resume normally
- At spaceScale 2x/3x, teleporting to a search result lands at the correct position
- After teleport settles, the nearest point is auto-selected (info panel shows)
