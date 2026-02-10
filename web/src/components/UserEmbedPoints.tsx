import { useRef, useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceStore } from '../store/useSpaceStore';

const POINT_SIZE_SCALE = 200;
const POINT_SIZE_LOG_BASE = 8;
const SCREEN_SCALE = 48.0;
const SCALE_FACTOR = 1.0;
const EMBED_COLOR: [number, number, number] = [1.0, 0.85, 0.2];

const vertexShader = /* glsl */ `
attribute vec3 color;
attribute float scaleFactor;

varying vec3 vColor;

uniform float pointSize;
uniform float screenScale;

#include <fog_pars_vertex>

void main() {
  vColor = color;
  vec4 cameraSpacePos = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * cameraSpacePos;

  float dist = length(cameraSpacePos.xyz);
  float outputPointSize = pointSize * screenScale / dist;
  gl_PointSize = max(outputPointSize * scaleFactor, 2.0);

  vec4 mvPosition = cameraSpacePos;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;

#include <common>
#include <fog_pars_fragment>

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float r2 = dot(center, center);

  // Dark halo shadow ring just outside the point body
  if (r2 > 0.25) discard;

  float outerR = sqrt(r2) * 2.27;
  if (r2 > 0.19) {
    float haloFade = (sqrt(r2) - 0.44) / 0.06;
    float haloAlpha = (1.0 - haloFade) * 0.35;
    gl_FragColor = vec4(0.0, 0.0, 0.0, haloAlpha);
    #include <fog_fragment>
    return;
  }

  // Sphere shading with smooth falloff
  float r = outerR;
  float r3 = r * r * r;
  float diffuse = 1.0 - r3 * 0.65;

  // Soft specular highlight
  float specDist = length(center - vec2(-0.1, -0.1));
  float spec = smoothstep(0.25, 0.0, specDist);

  // Rim darkening
  float rim = smoothstep(0.25, 0.4, sqrt(r2));

  vec3 shaded = vColor * diffuse * (1.0 - rim * 0.4) + vec3(1.0) * spec * 0.25;
  gl_FragColor = vec4(shaded, 1.0);

  #include <fog_fragment>
}
`;

export function UserEmbedPoints() {
  const pointsRef = useRef<THREE.Points>(null);
  const userEmbeds = useSpaceStore((s) => s.userEmbeds);
  const space = useSpaceStore((s) => s.space);
  const introState = useSpaceStore((s) => s.introState);
  const { raycaster } = useThree();

  const pointSize = useMemo(() => {
    if (!space) return 10;
    const n = space.points.length;
    return POINT_SIZE_SCALE / Math.log(n) / Math.log(POINT_SIZE_LOG_BASE);
  }, [space]);

  const geometry = useMemo(() => {
    if (userEmbeds.length === 0) return null;
    const n = userEmbeds.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const scaleFactors = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const pos = userEmbeds[i].pos;
      positions[i * 3] = pos[0];
      positions[i * 3 + 1] = pos[1];
      positions[i * 3 + 2] = pos[2];
      colors[i * 3] = EMBED_COLOR[0];
      colors[i * 3 + 1] = EMBED_COLOR[1];
      colors[i * 3 + 2] = EMBED_COLOR[2];
      scaleFactors[i] = SCALE_FACTOR;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('scaleFactor', new THREE.BufferAttribute(scaleFactors, 1));
    return geo;
  }, [userEmbeds]);

  useEffect(() => {
    raycaster.params.Points = { threshold: 0.5 };
  }, [raycaster]);

  const uniforms = useMemo(
    () =>
      THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          pointSize: { value: pointSize },
          screenScale: { value: SCREEN_SCALE },
        },
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    uniforms.pointSize.value = pointSize;
  }, [pointSize, uniforms]);

  const handleClick = (e: THREE.Intersection & { stopPropagation: () => void }) => {
    if (introState !== 'done') return;
    const index = (e as unknown as { index?: number }).index;
    if (index == null || index >= userEmbeds.length) return;
    e.stopPropagation();
    const embed = userEmbeds[index];
    useSpaceStore.getState().selectUserEmbed(embed);
  };

  const handlePointerOver = (e: THREE.Intersection & { stopPropagation: () => void }) => {
    if (introState !== 'done') return;
    const index = (e as unknown as { index?: number }).index;
    if (index == null || index >= userEmbeds.length) return;
    e.stopPropagation();
    useSpaceStore.getState().hoverUserEmbed(userEmbeds[index]);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    useSpaceStore.getState().hoverUserEmbed(null);
    document.body.style.cursor = 'auto';
  };

  if (!space || !geometry || userEmbeds.length === 0) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        fog
        transparent
        depthWrite={true}
      />
    </points>
  );
}
