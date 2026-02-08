import { create } from 'zustand';
import type { SpaceManifest, PointData, ColorMode } from '../types/space';
import type { EmbeddingService } from '../services/embeddingService';

export interface UserEmbed {
  id: string;
  label: string;
  pos: [number, number, number];
  createdAt: number;
}

function loadUserEmbeds(spaceUrl: string): UserEmbed[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(`noosphere-user-embeds:${spaceUrl}`);
  return raw ? JSON.parse(raw) : [];
}

function saveUserEmbeds(spaceUrl: string, embeds: UserEmbed[]) {
  localStorage.setItem(`noosphere-user-embeds:${spaceUrl}`, JSON.stringify(embeds));
}

interface SpaceState {
  // Data
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

  // Bias
  biasScores: number[];

  // Intro animation
  introState: 'pending' | 'animating' | 'done';

  // User embeds
  userEmbeds: UserEmbed[];
  selectedUserEmbed: UserEmbed | null;
  hoveredUserEmbed: UserEmbed | null;

  // Mode
  isAdvancedMode: boolean;

  // Actions
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
  addUserEmbed: (embed: UserEmbed) => void;
  removeUserEmbed: (id: string) => void;
  selectUserEmbed: (embed: UserEmbed | null) => void;
  hoverUserEmbed: (embed: UserEmbed | null) => void;
  setIntroState: (state: 'pending' | 'animating' | 'done') => void;
  toggleAdvancedMode: () => void;
}

const DEFAULT_SPACE_URL = '/spaces/minilm-10k.json.gz';

export const AVAILABLE_SPACES = [
  { id: 'minilm', label: 'MiniLM (384d)', url: '/spaces/minilm-10k.json.gz' },
  { id: 'qwen3', label: 'Qwen3 (1024d)', url: '/spaces/qwen3-10k.json.gz' },
];

export const useSpaceStore = create<SpaceState>((set) => ({
  spaceUrl: DEFAULT_SPACE_URL,
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

  biasScores: [],

  userEmbeds: loadUserEmbeds(DEFAULT_SPACE_URL),
  selectedUserEmbed: null,
  hoveredUserEmbed: null,

  introState: 'pending',

  isAdvancedMode: (typeof localStorage !== 'undefined' && localStorage.getItem('noosphere-advanced') === 'true') || false,

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
    userEmbeds: loadUserEmbeds(url),
    selectedUserEmbed: null,
    hoveredUserEmbed: null,
  }),
  setSpace: (space) => set({ space, loading: false, error: null, introState: 'animating' }),
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
  setIntroState: (state) => set({ introState: state }),
  toggleAdvancedMode: () => set((s) => {
    const next = !s.isAdvancedMode;
    localStorage.setItem('noosphere-advanced', String(next));
    return { isAdvancedMode: next };
  }),
}));
