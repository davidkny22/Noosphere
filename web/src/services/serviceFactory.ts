import type { EmbeddingService } from './embeddingService';
import { RemoteEmbeddingService } from './remoteEmbeddingService';
import { LocalEmbeddingService } from './localEmbeddingService';

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
        return { service: new RemoteEmbeddingService(serverUrl), mode: 'remote' };
      }
    } catch {
      if (mode === 'remote') {
        throw new Error('Remote server unreachable');
      }
      // auto mode: fall through to local
    }
  }

  // Local fallback (MiniLM only)
  const local = new LocalEmbeddingService(spaceUrl);
  await local.init(terms, positions);
  return { service: local, mode: 'local' };
}
