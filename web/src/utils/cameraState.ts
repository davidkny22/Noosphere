/**
 * Module-level camera state readable from outside the R3F Canvas (e.g. ShareButton).
 * Updated every frame by DistanceLegendUpdater, avoids __r3f internal access.
 */

let _cameraPos: [number, number, number] = [0, 0, 0];
let _cameraTarget: [number, number, number] = [0, 0, 0];

/** Get current camera position/target from outside the Canvas. */
export function getCameraState(): { pos: [number, number, number]; target: [number, number, number] } {
  return { pos: _cameraPos, target: _cameraTarget };
}

/** Update camera state — called from DistanceLegendUpdater inside useFrame. */
export function setCameraPos(pos: [number, number, number]) {
  _cameraPos = pos;
}

/** Update camera target — called from DistanceLegendUpdater inside useFrame. */
export function setCameraTarget(target: [number, number, number]) {
  _cameraTarget = target;
}
