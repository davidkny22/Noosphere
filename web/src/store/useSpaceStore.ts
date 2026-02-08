import { create } from 'zustand';
import type { SpaceManifest, PointData, ColorMode } from '../types/space';

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
  }),
  setSpace: (space) => set({ space, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  selectPoint: (point) => set({ selectedPoint: point }),
  hoverPoint: (point, index) => set({ hoveredPoint: point, hoveredIndex: index }),
  setHighlightedIndices: (indices) => set({ highlightedIndices: indices }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  flyTo: (target) => set({ flyToTarget: target, flyToState: 'animating' }),
  cancelFlyTo: () => set({ flyToTarget: null, flyToState: 'idle' }),
  setFlyToState: (state) => set({ flyToState: state }),
  setColorMode: (mode) => set({ colorMode: mode }),
}));
