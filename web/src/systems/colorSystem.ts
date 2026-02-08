import type { PointData, ClusterData, ColorMode } from '../types/space';
import { hslToRgb } from '../utils/color';

export interface ColorParams {
  clusterPalette?: Map<number, [number, number, number]>;
  highlightedIndices?: Set<number>;
  dimColor?: [number, number, number];
  neighborIndices?: number[];
  neighborCenter?: number | null;
  biasScores?: number[];
}

const NOISE_COLOR: [number, number, number] = [0.55, 0.55, 0.55];
const DIM_COLOR: [number, number, number] = [0.12, 0.12, 0.15];
const GOLDEN_ANGLE = 137.508;

export function buildClusterPalette(clusters: ClusterData[]): Map<number, [number, number, number]> {
  const palette = new Map<number, [number, number, number]>();
  clusters.forEach((c, i) => {
    const hue = (i * GOLDEN_ANGLE) % 360;
    const [r, g, b] = hslToRgb(hue / 360, 0.8, 0.65);
    palette.set(c.id, [r, g, b]);
  });
  palette.set(-1, NOISE_COLOR);
  return palette;
}

export function computeColors(
  points: PointData[],
  clusters: ClusterData[],
  mode: ColorMode,
  params: ColorParams
): Float32Array {
  const colors = new Float32Array(points.length * 3);
  const palette = params.clusterPalette ?? buildClusterPalette(clusters);

  if (mode === 'cluster') {
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const rgb = palette.get(point.cluster) ?? NOISE_COLOR;
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }
  } else if (mode === 'highlight') {
    const highlighted = params.highlightedIndices ?? new Set<number>();
    const dim = params.dimColor ?? DIM_COLOR;

    for (let i = 0; i < points.length; i++) {
      if (highlighted.has(i)) {
        const point = points[i]!;
        const rgb = palette.get(point.cluster) ?? NOISE_COLOR;
        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      } else {
        colors[i * 3] = dim[0];
        colors[i * 3 + 1] = dim[1];
        colors[i * 3 + 2] = dim[2];
      }
    }
  } else if (mode === 'neighborhood') {
    const neighborSet = new Set(params.neighborIndices ?? []);
    const center = params.neighborCenter;
    const dim = params.dimColor ?? DIM_COLOR;

    for (let i = 0; i < points.length; i++) {
      if (center != null && i === center) {
        // Center point = white
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
      } else if (neighborSet.has(i)) {
        // Neighbor = cluster color
        const point = points[i]!;
        const rgb = palette.get(point.cluster) ?? NOISE_COLOR;
        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      } else {
        colors[i * 3] = dim[0];
        colors[i * 3 + 1] = dim[1];
        colors[i * 3 + 2] = dim[2];
      }
    }
  } else if (mode === 'bias_gradient') {
    const scores = params.biasScores;
    if (scores && scores.length === points.length) {
      for (let i = 0; i < points.length; i++) {
        const s = scores[i]; // [-1, 1]
        if (s < 0) {
          // Negative = red (vivid)
          const t = -s;
          colors[i * 3] = 0.4 + 0.6 * t;     // 0.4 → 1.0
          colors[i * 3 + 1] = 0.4 - 0.35 * t; // 0.4 → 0.05
          colors[i * 3 + 2] = 0.4 - 0.3 * t;  // 0.4 → 0.1
        } else {
          // Positive = blue (vivid)
          const t = s;
          colors[i * 3] = 0.4 - 0.3 * t;     // 0.4 → 0.1
          colors[i * 3 + 1] = 0.4 - 0.1 * t;  // 0.4 → 0.3
          colors[i * 3 + 2] = 0.4 + 0.6 * t;  // 0.4 → 1.0
        }
      }
    } else {
      // No scores yet — cluster fallback
      for (let i = 0; i < points.length; i++) {
        const point = points[i]!;
        const rgb = palette.get(point.cluster) ?? NOISE_COLOR;
        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      }
    }
  } else {
    // Unknown mode — fall back to cluster
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const rgb = palette.get(point.cluster) ?? NOISE_COLOR;
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }
  }

  return colors;
}
