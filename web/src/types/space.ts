export interface PointData {
  term: string;
  pos: [number, number, number];
  cluster: number;
}

export interface ClusterData {
  id: number;
  label: string;
  representative_terms: string[];
  size: number;
  centroid: [number, number, number];
}

export interface SpaceManifest {
  version: string;
  model: string;
  model_full: string;
  embedding_dim: number;
  num_points: number;
  num_clusters: number;
  pacmap_params: Record<string, number>;
  hdbscan_params: Record<string, number>;
  points: PointData[];
  clusters: ClusterData[];
}

export type ColorMode = 'cluster' | 'highlight' | 'bias_gradient' | 'neighborhood';
