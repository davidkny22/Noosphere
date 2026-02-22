import type { PointData, ClusterData, ColorMode } from '../types/space';
import { hslToRgb } from '../utils/color';

export interface ColorParams {
  clusterPalette?: Map<number, [number, number, number]>;
  highlightedIndices?: Set<number>;
  dimColor?: [number, number, number];
  neighborIndices?: number[];
  neighborCenter?: number | null;
  biasScores?: number[];
  biasThreshold?: number;
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
    const threshold = params.biasThreshold ?? 0.15;
    if (scores && scores.length === points.length) {
      for (let i = 0; i < points.length; i++) {
        const s = scores[i]; // [-1, 1]
        const mag = Math.abs(s);

        // Neutral points nearly disappear; strongly biased points glow
        if (mag < threshold) {
          // Nearly invisible
          colors[i * 3] = 0.03;
          colors[i * 3 + 1] = 0.03;
          colors[i * 3 + 2] = 0.03;
        } else {
          // Intensity ramps from 0 at threshold to 1 at mag=1.0
          const intensity = (mag - threshold) / (1 - threshold);
          if (s < 0) {
            // Red pole — glow bright red
            colors[i * 3] = 0.15 + 0.95 * intensity;      // up to 1.1 (clamped by GPU)
            colors[i * 3 + 1] = 0.03 + 0.02 * intensity;  // stays dark
            colors[i * 3 + 2] = 0.03 + 0.05 * intensity;  // hint of warmth
          } else {
            // Blue pole — glow bright blue
            colors[i * 3] = 0.03 + 0.05 * intensity;      // hint of cool
            colors[i * 3 + 1] = 0.03 + 0.15 * intensity;  // slight cyan
            colors[i * 3 + 2] = 0.15 + 0.95 * intensity;  // up to 1.1
          }
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
