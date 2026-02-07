import type { PointData, ClusterData, ColorMode } from '../types/space';
import { hslToRgb } from '../utils/color';

export interface ColorParams {
  clusterPalette?: Map<number, [number, number, number]>;
  highlightedIndices?: Set<number>;
  dimColor?: [number, number, number];
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
  } else {
    // Phase 1 modes (bias_gradient, neighborhood) — fall back to cluster coloring
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
