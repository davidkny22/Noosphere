# Fix: Clicking doesn't work in Qwen space

## Context

When switching from a MiniLM space to the Qwen3 10K space, the user can navigate (orbit/pan) but cannot click any points. The root cause is that `introState` gets stuck at `'animating'` and never transitions to `'done'`, which blocks the click handler in `PointCloud.tsx`.

**Why it gets stuck:** `IntroAnimation.tsx` uses `scene.traverse()` to find the `THREE.Points` object on mount. Due to R3F reconciler timing, the Points may not yet exist in the scene when the effect fires after a space switch (Canvas unmounts/remounts). If the traversal finds nothing, `targetPositions.current` stays null, and `useFrame` never reaches the code that sets `introState: 'done'`.

**Click guard in PointCloud.tsx (line 193):**
```typescript
if (introState !== 'done' || !pointsRef.current) return;
```

## Changes

### Step 1: IntroAnimation — add safety timeout + retry

**File:** `web/src/components/IntroAnimation.tsx`

The `useEffect` that initializes the animation currently finds `THREE.Points` via `scene.traverse` and silently returns if not found. Fix:

- Add a **safety timeout** (separate `useEffect`): if `introState === 'animating'` for more than 4 seconds, force it to `'done'`. This ensures clicks are never permanently blocked.
- In the existing `useEffect`, if `pointsObj` is not found, schedule a **retry after one frame** via `requestAnimationFrame`. This handles the R3F reconciler timing gap where the Points object hasn't committed to the scene yet.
- Add cleanup: cancel the rAF on unmount/re-run.

### Step 2: Store — reset introState on space switch

**File:** `web/src/store/useSpaceStore.ts`

In `setSpaceUrl` (line 199), add `introState: 'pending'` to the reset state. Currently introState is NOT reset during space switches, which means if the old value is 'done' and then `setSpace` sets it to 'animating', there's a flash. Resetting to 'pending' on URL change makes the state machine cleaner.

## Key Files
- `web/src/components/IntroAnimation.tsx` — safety timeout + retry finding Points
- `web/src/store/useSpaceStore.ts` — reset introState in `setSpaceUrl`
- `web/src/components/PointCloud.tsx` — reference only (click handler guard)

## Verification
1. `cd web && npm run dev`
2. Load default MiniLM 10K → verify intro animation plays, clicking works
3. Switch to Qwen3 10K → verify intro animation plays (or skips gracefully), clicking works
4. Switch back to MiniLM → verify clicking still works
5. Rapidly switch between spaces → verify no permanent click-blocking
