# Search bar UX improvements + zoom fix + persistent user embeds

## Context

Phase 1 embedding features are working, but several UX issues remain:

1. **No visual marker at projected position** — after projecting novel text, the camera flies to a location but there's nothing visually distinct there. The user can't tell where the projected point landed.
2. **No loading feedback** — embedding takes a moment but the only indicator is a faint `...` inside the dropdown, easy to miss.
3. **Wrong label** — "Teleport to" doesn't describe what's happening. User chose **"Project [query]"**.
4. **Points vanish on deep zoom** — ScrollZoom moves both camera AND orbit target forward with no minimum bound. The camera passes through the entire cloud, putting all points behind it or beyond fog range. Everything disappears suddenly.

## Changes

### 1. Fly-to destination marker — `web/src/components/ProjectedMarker.tsx` (NEW)

A pulsating glow sphere at the fly-to destination — shown for **all** fly-to actions (search result click, projection, cluster click), not just novel projections:

- Reads `flyToTarget` from store (already exists — set by every `flyTo()` call)
- Only visible when `flyToState` is `'settling'` or `'idle'` (after arrival, not during animation)
- Renders a small `<mesh>` with `SphereGeometry` + `MeshBasicMaterial` (emissive, `fog: false` so it stays visible regardless of camera distance)
- `useFrame` drives a sine-wave pulsation on scale (0.8 → 1.4) and opacity (0.5 → 1.0), ~1.5s period
- Outer glow ring: second larger sphere with `AdditiveBlending` + low opacity for halo effect
- Auto-fades after ~3 seconds (opacity lerps to 0, then hides)
- Returns `null` when `flyToTarget` is null

No new store state needed — reuses existing `flyToTarget` and `flyToState`.

### 2. SearchBar — `web/src/components/SearchBar.tsx`

- Rename "Teleport to" → "Project" (both the label text and the CSS class color — keep `text-blue-400`)
- Add visible loading state: when `teleporting` is true, show a pulsing ring on the search bar border (`ring-blue-400/50 animate-pulse`) instead of the normal `ring-white/10`

### 4. SpaceCanvas — `web/src/components/SpaceCanvas.tsx`

- Import and add `<ProjectedMarker />` alongside existing scene children

### 5. Zoom fix — `web/src/components/ScrollZoom.tsx`

Root cause: no minimum distance check when zooming in. Camera passes through the cloud and all points end up behind it or beyond fog.

Fix: add `MIN_DISTANCE = 3` — when zooming in (`delta > 0`), block if `newPos.length() < MIN_DISTANCE`. This prevents the camera from reaching the cloud center (PaCMAP data is roughly centered at origin). Simple, no dynamic computation needed.

```ts
const MIN_DISTANCE = 3;
// existing: if (delta < 0 && newPos.length() > MAX_DISTANCE) return;
if (delta > 0 && newPos.length() < MIN_DISTANCE) return;
```

### 6. Clean up `projectedPosition` — `web/src/store/useSpaceStore.ts`, `SearchBar.tsx`, `PointCloud.tsx`

The `projectedPosition` state added earlier is now redundant — the marker uses `flyToTarget` instead. Remove `projectedPosition`, `setProjectedPosition`, and all references to them.

## Files touched (changes 1–6)

| File | Action |
|------|--------|
| `web/src/components/ProjectedMarker.tsx` | **Rewrite** — use `flyToTarget`/`flyToState` instead of `projectedPosition`, add auto-fade |
| `web/src/store/useSpaceStore.ts` | Remove `projectedPosition` + `setProjectedPosition` |
| `web/src/components/SearchBar.tsx` | Rename label, loading ring, remove `setProjectedPosition` calls |
| `web/src/components/SpaceCanvas.tsx` | Already has `<ProjectedMarker />` |
| `web/src/components/ScrollZoom.tsx` | Add `MIN_DISTANCE` zoom-in clamp |
| `web/src/components/PointCloud.tsx` | Remove `setProjectedPosition` call from `handlePointerMissed` |

## Verification (changes 1–6)

- Type "black hole" → click a term match → camera flies → pulsating glow at destination → fades after ~3s
- Type "black hole" → click "Project 'black hole'" → search bar border pulses blue while loading → camera flies → glow at destination
- Click a cluster → camera flies → glow at cluster centroid → fades
- Zoom in deeply → camera stops before passing through the cloud center, points never all vanish
- Type novel sentence → "Project" option appears → same fly+glow behavior

---

## Persistent User Embeds

### Context

Projecting novel text shows a temporary marker, but the point isn't actually added to the space. Users want their projected concepts to become permanent points in the cloud — visible, clickable, and persisted across sessions.

### Data model

```ts
interface UserEmbed {
  id: string;                          // crypto.randomUUID()
  label: string;                       // the query text
  pos: [number, number, number];       // 3D position from ParamRepulsor
  createdAt: number;                   // Date.now()
}
```

Persisted in `localStorage` under key `noosphere-user-embeds` (same pattern as `noosphere-advanced`).

### 7. Store — `web/src/store/useSpaceStore.ts`

- Add `userEmbeds: UserEmbed[]` to state, initialized from localStorage
- Add `addUserEmbed(embed)` — appends + writes to localStorage
- Add `removeUserEmbed(id)` — filters out + writes to localStorage
- Clear `userEmbeds` in `setSpaceUrl` (they're space-specific — key should include the space URL: `noosphere-user-embeds:${spaceUrl}`)

### 8. Capture embed in SearchBar — `web/src/components/SearchBar.tsx`

After successful `embeddingService.embed()` call (existing project flow), also call `addUserEmbed` to persist the point:

```ts
useSpaceStore.getState().addUserEmbed({
  id: crypto.randomUUID(),
  label: result.text,
  pos: embedResult.coords_3d,
  createdAt: Date.now(),
});
```

### 9. Render user embeds — `web/src/components/UserEmbedPoints.tsx` (NEW)

Separate `<points>` object (not merged into main PointCloud geometry — those buffers are fixed-size):

- Reads `userEmbeds` from store
- Builds its own `BufferGeometry` with position + color + scaleFactor attributes
- Reuses the same vertex/fragment shader from PointCloud (import or inline)
- Fixed color: golden/amber `[1.0, 0.85, 0.2]` — visually distinct from cluster colors
- Scale factor slightly larger than normal points (1.5×) for visibility
- Supports raycaster picking — `onClick` selects the user embed
- Returns `null` when `userEmbeds.length === 0`

### 10. SpaceCanvas — `web/src/components/SpaceCanvas.tsx`

- Add `<UserEmbedPoints />` alongside `<PointCloud />`

### 11. Selection & InfoPanel — `web/src/components/InfoPanel.tsx`

When a user embed is selected (vs a vocab point), show:

- The custom label as the heading
- A "User Embed" badge (amber)
- Position coordinates
- "Show Neighbors" button (same flow as vocab points)
- Delete button → calls `removeUserEmbed(id)` + deselects

Implementation: add `selectedUserEmbed: UserEmbed | null` and `selectUserEmbed` action to store. InfoPanel checks `selectedUserEmbed` first, falls back to `selectedPoint`.

### 12. PointLabel hover — `web/src/components/PointLabel.tsx`

When hovering a user embed point, show the custom label (not a vocab term). Read from `hoveredUserEmbed` in store.

## Files touched (user embeds)

| File | Action |
|------|--------|
| `web/src/store/useSpaceStore.ts` | Add `userEmbeds`, `selectedUserEmbed`, CRUD actions, localStorage persistence |
| `web/src/components/SearchBar.tsx` | Call `addUserEmbed` after successful projection |
| `web/src/components/UserEmbedPoints.tsx` | **Create** — separate point cloud for user embeds |
| `web/src/components/SpaceCanvas.tsx` | Add `<UserEmbedPoints />` |
| `web/src/components/InfoPanel.tsx` | Show user embed details + delete button when selected |
| `web/src/components/PointLabel.tsx` | Show user embed label on hover |

## Verification (user embeds)

- Project "the trolley problem" → golden point appears in cloud at projected position
- Refresh page → golden point persists, still visible and clickable
- Click golden point → InfoPanel shows "the trolley problem", "User Embed" badge, delete button
- Click delete → point removed from cloud and localStorage
- Switch spaces → user embeds from other space not shown
- Hover golden point → label tooltip shows "the trolley problem"
