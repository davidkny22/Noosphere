import { create } from 'zustand';
import type { SpaceManifest, PointData, ColorMode } from '../types/space';
import type { EmbeddingService } from '../services/embeddingService';

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
  setEmbeddingService: (service, mode) => set({ embeddingService: service, serviceMode: mode, serviceStatus: 'ready' }),
  setServiceStatus: (status) => set({ serviceStatus: status }),
  setNeighborhood: (center, indices) => set({ neighborCenter: center, neighborIndices: indices }),
  setBiasScores: (scores) => set({ biasScores: scores }),
}));
