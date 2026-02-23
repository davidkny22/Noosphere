import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSpaceStore } from '../store/useSpaceStore';

const TOP_N = 5; // extremes per pole

export function BiasLines() {
  const space = useSpaceStore((s) => s.space);
  const biasScores = useSpaceStore((s) => s.biasScores);
  const biasLinesEnabled = useSpaceStore((s) => s.biasLinesEnabled);
  const biasPoles = useSpaceStore((s) => s.biasPoles);

  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const timeRef = useRef(0);

  const geometry = useMemo(() => {
    if (!space || !biasLinesEnabled || biasScores.length === 0 || !biasPoles) return null;

    const points = space.points;
    const lowerA = biasPoles.a.toLowerCase();
    const lowerB = biasPoles.b.toLowerCase();

    // Find pole term indices (exact match, case-insensitive)
    let poleAIdx = points.findIndex((p) => p.term.toLowerCase() === lowerA);
    let poleBIdx = points.findIndex((p) => p.term.toLowerCase() === lowerB);

    // Fallback: use most extreme point on each side
    if (poleAIdx < 0) {
      let minScore = Infinity;
      for (let i = 0; i < biasScores.length; i++) {
        if (biasScores[i] < minScore) { minScore = biasScores[i]; poleAIdx = i; }
      }
    }
    if (poleBIdx < 0) {
      let maxScore = -Infinity;
      for (let i = 0; i < biasScores.length; i++) {
        if (biasScores[i] > maxScore) { maxScore = biasScores[i]; poleBIdx = i; }
      }
    }

    if (poleAIdx < 0 || poleBIdx < 0) return null;

    const posA = points[poleAIdx]!.pos;
    const posB = points[poleBIdx]!.pos;

    // Find top N most A-biased (most negative) and B-biased (most positive)
    const indexed = biasScores.map((s, i) => ({ score: s, index: i }));
    indexed.sort((a, b) => a.score - b.score);

    const topA: number[] = [];
    for (const item of indexed) {
      if (topA.length >= TOP_N) break;
      if (item.index !== poleAIdx && item.index !== poleBIdx) topA.push(item.index);
    }

    const topB: number[] = [];
    for (let i = indexed.length - 1; i >= 0; i--) {
      if (topB.length >= TOP_N) break;
      const item = indexed[i];
      if (item.index !== poleAIdx && item.index !== poleBIdx) topB.push(item.index);
    }

    // Build lines: 1 axis + topA.length from A + topB.length from B
    const numLines = 1 + topA.length + topB.length;
    const positions = new Float32Array(numLines * 6);
    const colors = new Float32Array(numLines * 6);

    let li = 0;

    // Axis line: A → B (white)
    const setLine = (pos1: number[], pos2: number[], r: number, g: number, b: number) => {
      const off = li * 6;
      positions[off] = pos1[0]; positions[off + 1] = pos1[1]; positions[off + 2] = pos1[2];
      positions[off + 3] = pos2[0]; positions[off + 4] = pos2[1]; positions[off + 5] = pos2[2];
      colors[off] = r; colors[off + 1] = g; colors[off + 2] = b;
      colors[off + 3] = r; colors[off + 4] = g; colors[off + 5] = b;
      li++;
    };

    setLine(posA, posB, 1.0, 1.0, 1.0);

    // Lines from pole A to its extremes (red)
    for (const idx of topA) {
      setLine(posA, points[idx]!.pos, 1.0, 0.2, 0.15);
    }

    // Lines from pole B to its extremes (blue)
    for (const idx of topB) {
      setLine(posB, points[idx]!.pos, 0.15, 0.3, 1.0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [space, biasScores, biasLinesEnabled, biasPoles]);

  useEffect(() => {
    return () => { geometry?.dispose(); };
  }, [geometry]);

  // Pulse animation
  useFrame((_, delta) => {
    if (!materialRef.current || !geometry) return;
    timeRef.current += delta;
    materialRef.current.opacity = 0.5 + 0.4 * Math.sin(timeRef.current * 3);
  });

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={0.8}
      />
    </lineSegments>
  );
}
