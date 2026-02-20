import type { EmbeddingService } from './embeddingService';
import { RemoteEmbeddingService } from './remoteEmbeddingService';

export type ServiceMode = 'auto' | 'remote' | 'local';

export async function createEmbeddingService(
  mode: ServiceMode,
  spaceUrl: string,
  _terms: string[],
  _positions: [number, number, number][],
  serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000',
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
      // Server unreachable — fall through to error below
    }
  }

  // Local fallback disabled — will be rebuilt with Transformers.js + proper ParamPaCMAP projection.
  // See localEmbeddingService.ts for details.
  throw new Error(
    `Embedding server unreachable at ${serverUrl}. Start the server with: cd server && uv run serve`
  );
}
