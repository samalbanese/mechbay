/**
 * Pure animation math for BayScene, kept free of any Phaser import so it can
 * be unit tested without a canvas/WebGL context. BayScene applies these
 * values to sprites each frame; this module only computes numbers.
 */

/**
 * Sprite facing based on horizontal screen-space travel direction. A mech
 * only re-faces when it actually moves horizontally — a purely vertical
 * step (straight north/south on the iso grid) keeps whatever facing it had.
 */
export function computeFacingFlipX(currentFlipX: boolean, deltaX: number): boolean {
  if (deltaX > 0) return false
  if (deltaX < 0) return true
  return currentFlipX
}

export interface WalkBobOffset {
  /** Vertical bob offset in px, added on top of the walk tween's own y. */
  yOffset: number
  /** Rotation sway in degrees, applied directly to sprite.angle. */
  angleDeg: number
}

export interface WalkBobOptions {
  amplitudePx: number
  frequencyHz: number
  swayDeg: number
}

export const DEFAULT_WALK_BOB: WalkBobOptions = {
  amplitudePx: 2.5,
  frequencyHz: 3.5,
  swayDeg: 1
}

/**
 * Sinusoidal walk-cycle bob, driven purely by elapsed time since the walk
 * leg started. Composing this on top of a position tween's own onUpdate
 * (rather than running a second, parallel tween against the sprite) avoids
 * two tweens fighting over sprite.y in the same frame. Callers are
 * responsible for snapping yOffset/angle back to exactly 0 when the walk
 * completes — this function only ever returns the raw oscillation.
 */
export function computeWalkBob(
  elapsedMs: number,
  opts: WalkBobOptions = DEFAULT_WALK_BOB
): WalkBobOffset {
  const cycle = (elapsedMs / 1000) * opts.frequencyHz * Math.PI * 2
  return {
    yOffset: Math.sin(cycle) * opts.amplitudePx,
    angleDeg: Math.sin(cycle + Math.PI / 2) * opts.swayDeg
  }
}
