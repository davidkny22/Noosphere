import type {
  EmbeddingService,
  EmbedResult,
  Neighbor,
  BiasScore,
  AnalogyResult,
  CompareResult,
} from './embeddingService';

/**
 * In-browser embedding service using Transformers.js (MiniLM only).
 *
 * DISABLED: This service fabricates 3D positions via weighted-average of
 * K-nearest known positions instead of using the trained ParamPaCMAP model.
 * It will be re-enabled once Transformers.js + proper ONNX projection is
 * implemented. The @huggingface/transformers dependency has been removed
 * from package.json in the meantime.
 *
 * See serviceFactory.ts for the disable point.
 */
export class LocalEmbeddingService implements EmbeddingService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractor: any = null;
  private hdEmbeddings: Float32Array | null = null;
  private embeddingDim = 0;
  private numPoints = 0;
  private terms: string[] = [];
  private positions: [number, number, number][] = [];
  private spaceUrl: string;
  private ready = false;

  constructor(spaceUrl: string) {
    // Derive base URL from space URL (e.g., /spaces/minilm-10k.json.gz → /spaces/minilm-10k)
    this.spaceUrl = spaceUrl.replace(/\.json(\.gz)?$/, '');
  }

  async init(terms: string[], positions: [number, number, number][]) {
    this.terms = terms;
    this.positions = positions;
    this.numPoints = terms.length;

    // Load HD embeddings binary
    const metaUrl = `${this.spaceUrl}-embeddings.json`;
    const binUrl = `${this.spaceUrl}-embeddings.bin`;

    const meta = await fetch(metaUrl).then((r) => r.json());
    this.embeddingDim = meta.embedding_dim;

    const buf = await fetch(binUrl).then((r) => r.arrayBuffer());
    this.hdEmbeddings = new Float32Array(buf);

    // Load MiniLM pipeline via Transformers.js
    // Dependency removed — re-add @huggingface/transformers to package.json to enable
    // @ts-expect-error — package not installed while local service is disabled
    const { pipeline } = await import(/* @vite-ignore */ '@huggingface/transformers');
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    });

    this.ready = true;
  }

  private ensureReady() {
    if (!this.ready) throw new Error('LocalEmbeddingService not initialized');
  }

  private async encode(text: string): Promise<Float32Array> {
    this.ensureReady();
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  }

  private cosineSearch(query: Float32Array, k: number): { index: number; distance: number }[] {
    const results: { index: number; distance: number }[] = [];
    const dim = this.embeddingDim;

    for (let i = 0; i < this.numPoints; i++) {
      const offset = i * dim;
      let dot = 0;
      for (let d = 0; d < dim; d++) {
        dot += query[d] * this.hdEmbeddings![offset + d];
      }
      results.push({ index: i, distance: dot });
    }

    results.sort((a, b) => b.distance - a.distance);
    return results.slice(0, k);
  }

  private project(query: Float32Array): [number, number, number] {
    // Weighted average of K=10 nearest known 3D positions
    const nearest = this.cosineSearch(query, 10);

    // Softmax weights from cosine similarities
    const maxSim = nearest[0].distance;
    const expWeights = nearest.map((n) => Math.exp((n.distance - maxSim) * 10));
    const sumExp = expWeights.reduce((a, b) => a + b, 0);

    let x = 0, y = 0, z = 0;
    for (let i = 0; i < nearest.length; i++) {
      const w = expWeights[i] / sumExp;
      const pos = this.positions[nearest[i].index];
      x += w * pos[0];
      y += w * pos[1];
      z += w * pos[2];
    }

    return [x, y, z];
  }

  async embed(text: string): Promise<EmbedResult> {
    const vec = await this.encode(text);
    const coords_3d = this.project(vec);
    const nearest = this.cosineSearch(vec, 10);

    return {
      coords_3d,
      neighbors: nearest.map((n) => ({
        term: this.terms[n.index],
        index: n.index,
        distance: n.distance,
      })),
    };
  }

  async neighbors(pointId: string, k: number): Promise<Neighbor[]> {
    this.ensureReady();
    const idx = parseInt(pointId);
    const dim = this.embeddingDim;
    const query = new Float32Array(dim);
    const offset = idx * dim;
    for (let d = 0; d < dim; d++) {
      query[d] = this.hdEmbeddings![offset + d];
    }

    return this.cosineSearch(query, k + 1)
      .filter((n) => n.index !== idx)
      .slice(0, k)
      .map((n) => ({
        term: this.terms[n.index],
        index: n.index,
        distance: n.distance,
      }));
  }

  async biasProbe(poleA: string, poleB: string): Promise<BiasScore[]> {
    const vecA = await this.encode(poleA);
    const vecB = await this.encode(poleB);
    const dim = this.embeddingDim;
    const scores: BiasScore[] = [];
    let maxAbs = 0;

    const rawScores = new Float32Array(this.numPoints);
    for (let i = 0; i < this.numPoints; i++) {
      const offset = i * dim;
      let dotA = 0, dotB = 0;
      for (let d = 0; d < dim; d++) {
        const v = this.hdEmbeddings![offset + d];
        dotA += v * vecA[d];
        dotB += v * vecB[d];
      }
      rawScores[i] = dotB - dotA;
      maxAbs = Math.max(maxAbs, Math.abs(rawScores[i]));
    }

    if (maxAbs < 1e-10) maxAbs = 1;

    for (let i = 0; i < this.numPoints; i++) {
      scores.push({
        term: this.terms[i],
        index: i,
        score: rawScores[i] / maxAbs,
      });
    }

    return scores;
  }

  async analogy(a: string, b: string, c: string): Promise<AnalogyResult> {
    const vecA = await this.encode(a);
    const vecB = await this.encode(b);
    const vecC = await this.encode(c);

    const dim = this.embeddingDim;
    const vecD = new Float32Array(dim);
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      vecD[d] = vecB[d] - vecA[d] + vecC[d];
      norm += vecD[d] * vecD[d];
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d++) vecD[d] /= norm;

    const nearest = this.cosineSearch(vecD, 10);
    const coords_3d = this.project(vecD);

    return {
      result_term: this.terms[nearest[0].index],
      coords_3d,
      neighbors: nearest.map((n) => ({
        term: this.terms[n.index],
        index: n.index,
        distance: n.distance,
      })),
      indexA: null,
      indexB: null,
      indexC: null,
    };
  }

  async compare(textA: string, textB: string): Promise<CompareResult> {
    const vecA = await this.encode(textA);
    const vecB = await this.encode(textB);

    let dot = 0;
    for (let d = 0; d < this.embeddingDim; d++) {
      dot += vecA[d] * vecB[d];
    }

    return {
      similarity: dot,
      coordsA: this.project(vecA),
      coordsB: this.project(vecB),
      indexA: null,
      indexB: null,
    };
  }
}
