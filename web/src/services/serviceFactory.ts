import type { EmbeddingService } from './embeddingService';
import { RemoteEmbeddingService } from './remoteEmbeddingService';
// import { LocalEmbeddingService } from './localEmbeddingService';

export type ServiceMode = 'auto' | 'remote' | 'local';

export async function createEmbeddingService(
  mode: ServiceMode,
  spaceUrl: string,
  terms: string[],
  positions: [number, number, number][],
  serverUrl = 'http://localhost:8000',
): Promise<{ service: EmbeddingService; mode: 'remote' | 'local' }> {
  if (mode === 'remote' || mode === 'auto') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${serverUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        // Derive space prefix from URL: "/spaces/minilm-10k.json.gz" → "minilm-10k"
        const prefix = spaceUrl.split('/').pop()!.replace(/\.json(\.gz)?$/, '');
        return { service: new RemoteEmbeddingService(serverUrl, prefix), mode: 'remote' };
      }
    } catch {
      // if (mode === 'remote') {
      //   throw new Error('Remote server unreachable');
      // }
      // auto mode: fall through to local
    }
  }

  // Local fallback disabled — LocalEmbeddingService fabricates 3D positions
  // via weighted-average instead of using trained ParamPaCMAP. Will be
  // rebuilt with Transformers.js + proper projection later.
  // const local = new LocalEmbeddingService(spaceUrl);
  // await local.init(terms, positions);
  // return { service: local, mode: 'local' };
  throw new Error(
    `Embedding server unreachable at ${serverUrl}. Start the server with: cd server && uv run serve`
  );
}
