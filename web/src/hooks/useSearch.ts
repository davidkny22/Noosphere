import { useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import type { SpaceManifest, ClusterData } from '../types/space';
import { useSpaceStore } from '../store/useSpaceStore';

interface TermMatch {
  type: 'term';
  term: string;
  index: number;
  score: number;
}

interface ClusterMatch {
  type: 'cluster';
  cluster: ClusterData;
}

export type SearchResult = TermMatch | ClusterMatch;

function searchClusters(query: string, clusters: ClusterData[]): ClusterMatch[] {
  const q = query.toLowerCase();
  return clusters
    .filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.representative_terms.some((t) => t.toLowerCase().includes(q))
    )
    .map((c) => ({ type: 'cluster' as const, cluster: c }));
}

export function useSearch(space: SpaceManifest | null) {
  const fuse = useMemo(() => {
    if (!space) return null;
    return new Fuse(
      space.points.map((p, i) => ({ term: p.term, index: i })),
      {
        keys: ['term'],
        threshold: 0.4,
        includeScore: true,
        shouldSort: true,
      }
    );
  }, [space]);

  const search = useCallback(
    (query: string): SearchResult[] => {
      if (!query.trim() || !space || !fuse) return [];

      const clusterMatches = searchClusters(query, space.clusters);
      const termResults = fuse.search(query, { limit: 20 });
      const termMatches: TermMatch[] = termResults.map((r) => ({
        type: 'term',
        term: r.item.term,
        index: r.item.index,
        score: r.score ?? 1,
      }));

      return [...clusterMatches, ...termMatches];
    },
    [space, fuse]
  );

  const getHighlightIndices = useCallback(
    (results: SearchResult[]): Set<number> => {
      if (!space) return new Set();
      const indices = new Set<number>();

      for (const result of results) {
        if (result.type === 'term') {
          indices.add(result.index);
        } else {
          // Add all points belonging to this cluster (O(1) lookup)
          const members = useSpaceStore.getState().clusterToIndices.get(result.cluster.id) ?? [];
          for (const i of members) indices.add(i);
        }
      }

      return indices;
    },
    [space]
  );

  return { search, getHighlightIndices };
}
