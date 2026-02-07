import { useEffect } from 'react';
import pako from 'pako';
import type { SpaceManifest } from '../types/space';
import { useSpaceStore } from '../store/useSpaceStore';

async function loadSpace(url: string): Promise<SpaceManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load space: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  let jsonString: string;

  // Vite dev server sets Content-Encoding: gzip for .gz files, causing the
  // browser to auto-decompress before we see the bytes. Try decoding as plain
  // text first; only fall back to pako if that fails to parse as JSON.
  const decoded = new TextDecoder().decode(buffer);
  try {
    JSON.parse(decoded);
    jsonString = decoded;
  } catch {
    // Bytes are still gzip-compressed — decompress with pako
    try {
      jsonString = pako.inflate(new Uint8Array(buffer), { to: 'string' });
    } catch {
      throw new Error('Failed to decompress space file — file may be corrupted');
    }
  }

  let data: SpaceManifest;
  try {
    data = JSON.parse(jsonString) as SpaceManifest;
  } catch {
    throw new Error('Space file contains invalid JSON');
  }

  if (!data.points?.length) throw new Error('Space file has no points');
  if (!data.clusters?.length) throw new Error('Space file has no clusters');
  if (data.points.some(p => !Array.isArray(p.pos) || p.pos.length !== 3)) {
    throw new Error('Space file has malformed point positions');
  }

  return data;
}

export function useSpaceLoader(url: string) {
  const setSpace = useSpaceStore((s) => s.setSpace);
  const setLoading = useSpaceStore((s) => s.setLoading);
  const setError = useSpaceStore((s) => s.setError);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    loadSpace(url)
      .then((space) => {
        if (!cancelled) setSpace(space);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error loading space');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, setSpace, setLoading, setError]);
}
