# Bias Probe: Bias-Colored Neighbor Lines

## Context

The bias probe recolors the entire space on a red-to-blue gradient between two concept poles. Currently there's no way to see the real embedding associations around a point while bias is active. The user wants to click a point and see its K nearest neighbor lines — the same real connections the model encoded — but colored by each neighbor's bias score, with pulsating intensity for visibility.

## Approach

Reuse the existing neighbor query infrastructure (`embeddingService.neighbors()`) and the existing `NeighborLines` component. When bias probe is active and a toggle is on, auto-query neighbors on point click and render the lines with per-vertex bias colors + pulse animation.

## Implementation

### Step 1: Store — add `biasLinesEnabled` toggle

**File:** `web/src/store/useSpaceStore.ts`

- Add `biasLinesEnabled: boolean` to `SpaceState` interface (near line 64, bias section)
- Add `setBiasLinesEnabled: (enabled: boolean) => void` action
- Initial value: `false`
- Add action: `setBiasLinesEnabled: (enabled) => set({ biasLinesEnabled: enabled })`

### Step 2: BiasProbePanel — toggle + auto-trigger neighbors

**File:** `web/src/components/BiasProbePanel.tsx`

Add a checkbox/toggle below the Probe button (visible when `colorMode === 'bias_gradient'`):
```
[✓] Show neighbor links
```

Add a `useEffect` that auto-queries neighbors when:
- `biasLinesEnabled === true`
- `colorMode === 'bias_gradient'`
- `selectedPoint` changes (non-null)

The effect calls `embeddingService.neighbors(pointIndex, 10)` and stores results via `setNeighborhood(pointIndex, neighborIndices)` — the same store actions that "Show Neighbors" in InfoPanel uses.

When `biasLinesEnabled` is toggled off or bias is cleared, call `setNeighborhood(null, [])` to hide lines.

### Step 3: NeighborLines — bias-colored mode with pulse

**File:** `web/src/components/NeighborLines.tsx`

Modify the existing component to support two rendering modes:

**Regular mode** (no bias): Current behavior — white lines, static opacity 0.25.

**Bias mode** (when `biasScores.length > 0 && biasLinesEnabled`):
- Add per-vertex `color` attribute to the BufferGeometry
- For each line (center→neighbor), compute the neighbor's bias color:
  - Score < 0: red (same formula as `colorSystem.ts` bias_gradient mode)
  - Score > 0: blue
  - Both vertices of each line get the neighbor's bias color (uniform color per line)
- Use `<lineBasicMaterial vertexColors transparent opacity={pulseOpacity} />`
- Higher base opacity (0.6-0.8) for visibility
- `useFrame` animates `pulseOpacity` with a sine wave: `0.5 + 0.4 * sin(time * 3)`

**Geometry changes:**
- `useMemo` now depends on `biasScores` and `biasLinesEnabled` in addition to existing deps
- Creates a `color` Float32Array (same size as positions — 2 RGB triplets per line)
- Maps each `neighborIndices[i]`'s bias score to an RGB triplet using the same red→gray→blue interpolation as `colorSystem.ts`
- Intensifies saturation for line visibility (multiply the color channel extremes by ~1.3, clamp to 1.0)

**Ref for material:**
- `useRef` for the material to update opacity in `useFrame`
- `useFrame((_, delta) => { ... })` oscillates `materialRef.current.opacity`

### Step 4: SpaceCanvas — no changes needed

`<NeighborLines />` is already rendered inside the `<group scale>`. No changes required.

## Key Files
- `web/src/store/useSpaceStore.ts` — add `biasLinesEnabled` state + action
- `web/src/components/BiasProbePanel.tsx` — add toggle + auto-neighbor effect
- `web/src/components/NeighborLines.tsx` — add per-vertex bias coloring + pulse animation
- `web/src/systems/colorSystem.ts` — reference only (reuse the bias color formula)

## Verification
1. `cd web && npm run dev`
2. Select MiniLM 10K or 150K space
3. Toggle Advanced mode → open Bias Probe
4. Enter poles (e.g., "science" vs "art"), click Probe → space recolors
5. Enable "Show neighbor links" toggle
6. Click any point → neighbor lines appear, colored red/blue by each neighbor's bias score, pulsating
7. Click a different point → lines update to new neighbors
8. Toggle off → lines disappear
9. Click "Clear" on bias → lines disappear, reverts to cluster coloring
10. Verify regular "Show Neighbors" in InfoPanel still works as before (white lines, no pulse)
