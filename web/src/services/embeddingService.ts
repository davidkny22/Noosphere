// Phase 0: interface definition only. No implementations yet.
// Phase 1 adds RemoteEmbeddingService and LocalEmbeddingService.

export interface EmbedResult {
  coords_3d: [number, number, number];
  neighbors: Neighbor[];
}

export interface Neighbor {
  term: string;
  index: number;
  distance: number;
}

export interface BiasScore {
  term: string;
  index: number;
  score: number;
}

export interface AnalogyResult {
  result_term: string;
  coords_3d: [number, number, number];
  neighbors: Neighbor[];
}

export interface CompareResult {
  similarity: number;
  coordsA: [number, number, number];
  coordsB: [number, number, number];
}

export interface EmbeddingService {
  embed(text: string): Promise<EmbedResult>;
  neighbors(pointId: string, k: number): Promise<Neighbor[]>;
  biasProbe(poleA: string, poleB: string): Promise<BiasScore[]>;
  analogy(a: string, b: string, c: string): Promise<AnalogyResult>;
  compare(textA: string, textB: string): Promise<CompareResult>;
}
