import { create } from 'zustand';
import type { SpaceManifest, PointData, ColorMode } from '../types/space';
import type { EmbeddingService, Neighbor, BiasStats } from '../services/embeddingService';

export interface AnalogyResultData {
  a: string;
  b: string;
  c: string;
  resultTerm: string;
  coordsResult: [number, number, number];
  neighbors: Neighbor[];
}

export interface UserEmbed {
  id: string;
  label: string;
  pos: [number, number, number];
  createdAt: number;
}

function loadUserEmbeds(spaceUrl: string): UserEmbed[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(`noosphere-user-embeds:${spaceUrl}`);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

function saveUserEmbeds(spaceUrl: string, embeds: UserEmbed[]) {
  localStorage.setItem(`noosphere-user-embeds:${spaceUrl}`, JSON.stringify(embeds));
}

export interface SpaceEntry {
  id: string;
  label: string;
  url: string;
}

interface SpaceState {
  // Data
  availableSpaces: SpaceEntry[];
  spaceUrl: string;
  space: SpaceManifest | null;
  loading: boolean;
  error: string | null;

  // Selection
  selectedPoint: PointData | null;
  hoveredPoint: PointData | null;
  hoveredIndex: number | null;

  // Search
  highlightedIndices: Set<number>;
  searchQuery: string;

  // Camera
  flyToTarget: [number, number, number] | null;
  flyToState: 'idle' | 'animating' | 'settling';

  // Color
  colorMode: ColorMode;

  // Embedding service
  embeddingService: EmbeddingService | null;
  serviceMode: 'remote' | 'local' | null;
  serviceStatus: 'idle' | 'connecting' | 'ready' | 'error';

  // Neighborhood
  neighborIndices: number[];
  neighborCenter: number | null;

  // Lookup maps (computed when space loads)
  termToIndex: Map<string, number>;
  clusterToIndices: Map<number, number[]>;

  // Bias
  biasScores: number[];
  biasLinesEnabled: boolean;
  biasPoles: { a: string; b: string } | null;
  biasStats: BiasStats | null;
  biasPoleSimilarity: number | null;
  biasThreshold: number;

  // Search history breadcrumbs
  searchHistory: Array<{ query: string; pos: [number, number, number]; timestamp: number }>;

  // Intro animation
  introState: 'pending' | 'animating' | 'done';

  // User embeds
  userEmbeds: UserEmbed[];
  selectedUserEmbed: UserEmbed | null;
  hoveredUserEmbed: UserEmbed | null;

  // Analogy
  analogyResult: AnalogyResultData | null;

  // Comparison
  comparisonResult: {
    textA: string;
    textB: string;
    similarity: number;
    coordsA: [number, number, number];
    coordsB: [number, number, number];
  } | null;

  // Control mode
  controlMode: 'orbit' | 'fly';

  // Space scale
  spaceScale: number;
  scaleBarDistance: number;

  // Pulse effect on teleport target
  pulseIndex: number | null;

  // Mode
  isAdvancedMode: boolean;

  // Actions
  setAvailableSpaces: (spaces: SpaceEntry[]) => void;
  setSpaceUrl: (url: string) => void;
  setSpace: (space: SpaceManifest) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectPoint: (point: PointData | null) => void;
  hoverPoint: (point: PointData | null, index: number | null) => void;
  setHighlightedIndices: (indices: Set<number>) => void;
  setSearchQuery: (query: string) => void;
  flyTo: (target: [number, number, number]) => void;
  cancelFlyTo: () => void;
  setFlyToState: (state: 'idle' | 'animating' | 'settling') => void;
  setColorMode: (mode: ColorMode) => void;
  setEmbeddingService: (service: EmbeddingService, mode: 'remote' | 'local') => void;
  setServiceStatus: (status: 'idle' | 'connecting' | 'ready' | 'error') => void;
  setNeighborhood: (center: number | null, indices: number[]) => void;
  setBiasScores: (scores: number[]) => void;
  setBiasLinesEnabled: (enabled: boolean) => void;
  setBiasPoles: (poles: { a: string; b: string } | null) => void;
  setBiasStats: (stats: BiasStats | null) => void;
  setBiasPoleSimilarity: (sim: number | null) => void;
  setBiasThreshold: (threshold: number) => void;
  addUserEmbed: (embed: UserEmbed) => void;
  removeUserEmbed: (id: string) => void;
  selectUserEmbed: (embed: UserEmbed | null) => void;
  hoverUserEmbed: (embed: UserEmbed | null) => void;
  setAnalogyResult: (result: AnalogyResultData | null) => void;
  setComparisonResult: (result: SpaceState['comparisonResult']) => void;
  setControlMode: (mode: 'orbit' | 'fly') => void;
  setPulseIndex: (index: number | null) => void;
  cycleSpaceScale: () => void;
  addSearchHistory: (entry: { query: string; pos: [number, number, number]; timestamp: number }) => void;
  clearSearchHistory: () => void;
  setIntroState: (state: 'pending' | 'animating' | 'done') => void;
  toggleAdvancedMode: () => void;
}

/** Read space URL from bookmark hash if present. */
function getBookmarkSpaceUrl(): string | null {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  if (hash.length > 1) {
    const params = new URLSearchParams(hash.slice(1));
    const sp = params.get('sp');
    // Only accept relative /spaces/ paths (no absolute URLs or traversal)
    if (sp && sp.startsWith('/spaces/') && !sp.includes('..')) return sp;
  }
  return null;
}

export const useSpaceStore = create<SpaceState>((set) => ({
  availableSpaces: [],
  spaceUrl: getBookmarkSpaceUrl() ?? '',
  space: null,
  loading: true,
  error: null,

  selectedPoint: null,
  hoveredPoint: null,
  hoveredIndex: null,

  highlightedIndices: new Set<number>(),
  searchQuery: '',

  flyToTarget: null,
  flyToState: 'idle',

  colorMode: 'cluster',

  embeddingService: null,
  serviceMode: null,
  serviceStatus: 'idle',

  neighborIndices: [],
  neighborCenter: null,

  termToIndex: new Map<string, number>(),
  clusterToIndices: new Map<number, number[]>(),

  biasScores: [],
  biasLinesEnabled: false,
  biasPoles: null,
  biasStats: null,
  biasPoleSimilarity: null,
  biasThreshold: 0.15,

  searchHistory: [],

  userEmbeds: [],
  selectedUserEmbed: null,
  hoveredUserEmbed: null,

  introState: 'pending',

  analogyResult: null,

  comparisonResult: null,


  controlMode: 'fly',
  spaceScale: 1,
  scaleBarDistance: 0,
  pulseIndex: null,

  isAdvancedMode: (typeof localStorage !== 'undefined' && localStorage.getItem('noosphere-advanced') === 'true') || false,


  setAvailableSpaces: (spaces) => set((state) => {
    // If no space is selected yet, auto-select the first available
    const needsDefault = !state.spaceUrl && spaces.length > 0;
    const url = needsDefault ? spaces[0].url : state.spaceUrl;
    return {
      availableSpaces: spaces,
      ...(needsDefault ? { spaceUrl: url, userEmbeds: loadUserEmbeds(url) } : {}),
    };
  }),
  setSpaceUrl: (url) => set({
    spaceUrl: url,
    space: null,
    loading: true,
    error: null,
    selectedPoint: null,
    hoveredPoint: null,
    hoveredIndex: null,
    highlightedIndices: new Set<number>(),
    searchQuery: '',
    flyToTarget: null,
    flyToState: 'idle',
    colorMode: 'cluster',
    introState: 'pending',
    userEmbeds: loadUserEmbeds(url),
    selectedUserEmbed: null,
    hoveredUserEmbed: null,
    searchHistory: [],
  }),
  setSpace: (space) => {
    const termToIndex = new Map(space.points.map((p, i) => [p.term, i]));
    const clusterToIndices = new Map<number, number[]>();
    space.points.forEach((p, i) => {
      const arr = clusterToIndices.get(p.cluster);
      if (arr) arr.push(i);
      else clusterToIndices.set(p.cluster, [i]);
    });
    return set({ space, loading: false, error: null, introState: 'animating', termToIndex, clusterToIndices });
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  selectPoint: (point) => set({ selectedPoint: point, selectedUserEmbed: null }),
  hoverPoint: (point, index) => set({ hoveredPoint: point, hoveredIndex: index }),
  setHighlightedIndices: (indices) => set({ highlightedIndices: indices }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  flyTo: (target) => set({ flyToTarget: target, flyToState: 'animating' }),
  cancelFlyTo: () => set({ flyToTarget: null, flyToState: 'idle' }),
  setFlyToState: (state) => set({ flyToState: state }),
  setColorMode: (mode) => set({ colorMode: mode }),
  setEmbeddingService: (service, mode) => set({ embeddingService: service, serviceMode: mode, serviceStatus: 'ready' }),
  setServiceStatus: (status) => set({ serviceStatus: status }),
  setNeighborhood: (center, indices) => set({ neighborCenter: center, neighborIndices: indices }),
  setBiasScores: (scores) => set({ biasScores: scores }),
  setBiasLinesEnabled: (enabled) => set({ biasLinesEnabled: enabled }),
  setBiasPoles: (poles) => set({ biasPoles: poles }),
  setBiasStats: (stats) => set({ biasStats: stats }),
  setBiasPoleSimilarity: (sim) => set({ biasPoleSimilarity: sim }),
  setBiasThreshold: (threshold) => set({ biasThreshold: threshold }),
  addUserEmbed: (embed) => set((s) => {
    const next = [...s.userEmbeds, embed];
    saveUserEmbeds(s.spaceUrl, next);
    return { userEmbeds: next };
  }),
  removeUserEmbed: (id) => set((s) => {
    const next = s.userEmbeds.filter((e) => e.id !== id);
    saveUserEmbeds(s.spaceUrl, next);
    return { userEmbeds: next, selectedUserEmbed: s.selectedUserEmbed?.id === id ? null : s.selectedUserEmbed };
  }),
  selectUserEmbed: (embed) => set({ selectedUserEmbed: embed, selectedPoint: null }),
  hoverUserEmbed: (embed) => set({ hoveredUserEmbed: embed }),
  setAnalogyResult: (result) => set({ analogyResult: result }),
  setComparisonResult: (result) => set({ comparisonResult: result }),
  setControlMode: (mode) => set({ controlMode: mode }),
  setPulseIndex: (index) => set({ pulseIndex: index }),
  cycleSpaceScale: () => set((s) => {
    const scales = [0.5, 1, 2, 3];
    const next = scales[(scales.indexOf(s.spaceScale) + 1) % scales.length]!;
    return { spaceScale: next };
  }),
  addSearchHistory: (entry) => set((s) => ({
    searchHistory: [...s.searchHistory.slice(-49), entry],
  })),
  clearSearchHistory: () => set({ searchHistory: [] }),
  setIntroState: (state) => set({ introState: state }),
  toggleAdvancedMode: () => set((s) => {
    const next = !s.isAdvancedMode;
    localStorage.setItem('noosphere-advanced', String(next));
    return { isAdvancedMode: next };
  }),
}));
