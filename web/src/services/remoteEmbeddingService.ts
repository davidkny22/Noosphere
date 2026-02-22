import type {
  EmbeddingService,
  EmbedResult,
  Neighbor,
  BiasProbeResult,
  AnalogyResult,
  CompareResult,
} from './embeddingService';

export class RemoteEmbeddingService implements EmbeddingService {
  private baseUrl: string;
  private spacePrefix: string;

  constructor(serverUrl: string, spacePrefix: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '');
    this.spacePrefix = spacePrefix;
  }

  async embed(text: string): Promise<EmbedResult> {
    const res = await this.post('/embed', { space: this.spacePrefix, text, k: 10 });
    return {
      coords_3d: res.coords_3d,
      neighbors: res.neighbors,
    };
  }

  async neighbors(pointId: string, k: number): Promise<Neighbor[]> {
    const res = await this.post('/neighbors', { space: this.spacePrefix, index: parseInt(pointId), k });
    return res.neighbors;
  }

  async biasProbe(poleA: string, poleB: string): Promise<BiasProbeResult> {
    const res = await this.post('/bias', { space: this.spacePrefix, pole_a: poleA, pole_b: poleB });
    return {
      scores: res.scores,
      poleSimilarity: res.pole_similarity,
      stats: {
        mean: res.stats.mean,
        std: res.stats.std,
        median: res.stats.median,
        absMean: res.stats.abs_mean,
      },
    };
  }

  async analogy(a: string, b: string, c: string): Promise<AnalogyResult> {
    const res = await this.post('/analogy', { space: this.spacePrefix, a, b, c, k: 10 });
    return {
      result_term: res.result_term,
      coords_3d: res.coords_3d,
      neighbors: res.neighbors,
      indexA: res.index_a ?? null,
      indexB: res.index_b ?? null,
      indexC: res.index_c ?? null,
    };
  }

  async compare(textA: string, textB: string): Promise<CompareResult> {
    const res = await this.post('/compare', { space: this.spacePrefix, text_a: textA, text_b: textB });
    return {
      similarity: res.similarity,
      coordsA: res.coords_a,
      coordsB: res.coords_b,
      indexA: res.index_a ?? null,
      indexB: res.index_b ?? null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
}
