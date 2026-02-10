# Distance legend — dynamic scale bar

## Context

Users can't tell if two points that appear close on screen are genuinely semantically similar or just look close because of zoom. A dynamic scale bar (like Google Maps) shows what a fixed screen-width line represents in 3D space units, updating live as the camera moves.

## Design

Fixed overlay at **bottom-left** (currently unoccupied) showing:
- A horizontal bar line (100px wide)
- The 3D distance it represents (e.g., "~5 units")
- A qualitative label

### Scale computation

```
cam_distance = length(camera.position)
screen_height_world = 2 * cam_distance * tan(fov_rad / 2)
world_per_px = screen_height_world / viewport_height
bar_distance = BAR_WIDTH_PX * world_per_px / spaceScale
```

### Qualitative bands

| 3D distance | Label |
|-------------|-------|
| < 5 | Close neighbors |
| 5–20 | Related |
| 20–50 | Weakly related |
| > 50 | Distant |

## Changes

### Step 1: Create `DistanceLegend.tsx`

**File:** `web/src/components/DistanceLegend.tsx`

A component inside the R3F Canvas that:
1. Uses `useFrame` + `useThree` to read camera position, fov, viewport height each frame
2. Reads `spaceScale` from store
3. Computes bar distance per the math above
4. Updates a ref (avoids re-renders every frame) and only triggers state update when the qualitative label changes
5. Renders via drei `<Html>` with `style={{ position: 'fixed', bottom: 16, left: 16 }}` and `calculatePosition={() => [0, 0]}` to pin to screen corner

Visual: a thin white line with tick marks at ends, distance number above, qualitative label below. Matches existing UI style (`bg-black/60 backdrop-blur-sm text-white/70 text-xs`).

### Step 2: Mount in SpaceCanvas

**File:** `web/src/components/SpaceCanvas.tsx`

Add `<DistanceLegend />` inside the Canvas alongside other overlay components.

## Key Files
- `web/src/components/DistanceLegend.tsx` — new
- `web/src/components/SpaceCanvas.tsx` — mount

## Verification
1. Load any space, zoom in close → small distance, "close neighbors"
2. Zoom out → larger distance, "distant"
3. Toggle spaceScale 1x→2x→3x → bar distance adjusts
4. Rotate camera → bar stays fixed at bottom-left

## Status: COMPLETED
