# Always-visible embed option in search bar

## Context

Phase 1 backend and service layer are fully working (embed, neighbors, bias, etc.), but the "Teleport to [query]" option in the search bar only appears when there are **zero** Fuse.js matches. Since partial matching catches almost everything, users have no way to embed novel text through the UI.

## Fix

**File**: `web/src/components/SearchBar.tsx` (~line 40)

Change the condition that appends the teleport option from:

```ts
if (hits.length === 0 && embeddingService && input.trim().length > 1) {
```

to:

```ts
if (embeddingService && input.trim().length > 1) {
```

This makes "Teleport to [query]" always appear at the bottom of search results when the embedding service is connected — even when there are existing term matches above it.

## Verification

- Type "black hole" → see term matches AND "Teleport to 'black hole'" at bottom
- Type "the trolley problem in ethical philosophy" → no term matches, teleport option appears
- Click teleport → camera flies to projected 3D position
