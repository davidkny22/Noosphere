/**
 * State bookmark system — encode/decode visualization state into URL hashes.
 *
 * Format: #sp=<space>&cx=<x>&cy=<y>&cz=<z>&tx=<x>&ty=<y>&tz=<z>&sc=<scale>&cm=<colorMode>&ctrl=<controlMode>&sel=<term>
 *
 * All floats are rounded to 2 decimal places for compact URLs.
 */

import type { ColorMode } from '../types/space';

export interface BookmarkState {
  spaceUrl: string;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  spaceScale: number;
  colorMode: ColorMode;
  controlMode: 'orbit' | 'fly';
  selectedTerm: string | null;
}

const KEY_SPACE = 'sp';
const KEY_CAM_X = 'cx';
const KEY_CAM_Y = 'cy';
const KEY_CAM_Z = 'cz';
const KEY_TGT_X = 'tx';
const KEY_TGT_Y = 'ty';
const KEY_TGT_Z = 'tz';
const KEY_SCALE = 'sc';
const KEY_COLOR = 'cm';
const KEY_CTRL = 'ctrl';
const KEY_SEL = 'sel';

function r2(n: number): string {
  return n.toFixed(2);
}

export function encodeBookmark(state: BookmarkState): string {
  const params = new URLSearchParams();
  params.set(KEY_SPACE, state.spaceUrl);
  params.set(KEY_CAM_X, r2(state.cameraPos[0]));
  params.set(KEY_CAM_Y, r2(state.cameraPos[1]));
  params.set(KEY_CAM_Z, r2(state.cameraPos[2]));
  params.set(KEY_TGT_X, r2(state.cameraTarget[0]));
  params.set(KEY_TGT_Y, r2(state.cameraTarget[1]));
  params.set(KEY_TGT_Z, r2(state.cameraTarget[2]));
  params.set(KEY_SCALE, String(state.spaceScale));
  params.set(KEY_COLOR, state.colorMode);
  params.set(KEY_CTRL, state.controlMode);
  if (state.selectedTerm) {
    params.set(KEY_SEL, state.selectedTerm);
  }
  return '#' + params.toString();
}

export function decodeBookmark(hash: string): BookmarkState | null {
  if (!hash || hash.length < 2) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  const spaceUrl = params.get(KEY_SPACE);
  if (!spaceUrl) return null;

  const cx = parseFloat(params.get(KEY_CAM_X) ?? '');
  const cy = parseFloat(params.get(KEY_CAM_Y) ?? '');
  const cz = parseFloat(params.get(KEY_CAM_Z) ?? '');
  if (isNaN(cx) || isNaN(cy) || isNaN(cz)) return null;

  const tx = parseFloat(params.get(KEY_TGT_X) ?? '0');
  const ty = parseFloat(params.get(KEY_TGT_Y) ?? '0');
  const tz = parseFloat(params.get(KEY_TGT_Z) ?? '0');

  const scaleRaw = parseFloat(params.get(KEY_SCALE) ?? '1');
  const spaceScale = [0.5, 1, 2, 3].includes(scaleRaw) ? scaleRaw : 1;

  const colorRaw = params.get(KEY_COLOR) ?? 'cluster';
  const colorMode = (['cluster', 'highlight', 'neighborhood', 'bias_gradient'].includes(colorRaw)
    ? colorRaw
    : 'cluster') as ColorMode;

  const ctrlRaw = params.get(KEY_CTRL) ?? 'fly';
  const controlMode = ctrlRaw === 'orbit' ? 'orbit' : 'fly';

  const selectedTerm = params.get(KEY_SEL) || null;

  return {
    spaceUrl,
    cameraPos: [cx, cy, cz],
    cameraTarget: [tx, ty, tz],
    spaceScale,
    colorMode,
    controlMode,
    selectedTerm,
  };
}

/**
 * Build a full shareable URL from the current page URL + bookmark hash.
 */
export function buildShareUrl(state: BookmarkState): string {
  const url = new URL(window.location.href);
  url.hash = encodeBookmark(state).slice(1); // remove leading #, URL constructor adds it
  return url.toString();
}
