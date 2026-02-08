import type {
  EmbeddingService,
  EmbedResult,
  Neighbor,
  BiasScore,
  AnalogyResult,
  CompareResult,
} from './embeddingService';

export class RemoteEmbeddingService implements EmbeddingService {
  private baseUrl: string;

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '');
  }

  async embed(text: string): Promise<EmbedResult> {
    const res = await this.post('/embed', { text, k: 10 });
    return {
      coords_3d: res.coords_3d,
      neighbors: res.neighbors,
    };
  }

  async neighbors(pointId: string, k: number): Promise<Neighbor[]> {
    const res = await this.post('/neighbors', { index: parseInt(pointId), k });
    return res.neighbors;
  }

  async biasProbe(poleA: string, poleB: string): Promise<BiasScore[]> {
    const res = await this.post('/bias', { pole_a: poleA, pole_b: poleB });
    return res.scores;
  }

  async analogy(a: string, b: string, c: string): Promise<AnalogyResult> {
    const res = await this.post('/analogy', { a, b, c, k: 10 });
    return {
      result_term: res.result_term,
      coords_3d: res.coords_3d,
      neighbors: res.neighbors,
    };
  }

  async compare(textA: string, textB: string): Promise<CompareResult> {
    const res = await this.post('/compare', { text_a: textA, text_b: textB });
    return {
      similarity: res.similarity,
      coordsA: res.coords_a,
      coordsB: res.coords_b,
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
