import { describe, it, expect } from 'vitest'
import {
  computeFacingFlipX,
  computeWalkBob,
  DEFAULT_WALK_BOB
} from '../../src/renderer/src/game/bay-animation'

describe('computeFacingFlipX', () => {
  it('faces left (flipX true) when moving in the negative screen-x direction', () => {
    expect(computeFacingFlipX(false, -42)).toBe(true)
  })

  it('faces right (flipX false) when moving in the positive screen-x direction', () => {
    expect(computeFacingFlipX(true, 42)).toBe(false)
  })

  it('keeps the current facing on a purely vertical step (deltaX === 0)', () => {
    expect(computeFacingFlipX(true, 0)).toBe(true)
    expect(computeFacingFlipX(false, 0)).toBe(false)
  })

  it('treats negative zero as no horizontal movement (edge case)', () => {
    expect(computeFacingFlipX(true, -0)).toBe(true)
  })
})

describe('computeWalkBob', () => {
  it('starts a fresh walk leg at zero vertical offset', () => {
    const bob = computeWalkBob(0)
    expect(bob.yOffset).toBeCloseTo(0, 5)
  })

  it('reaches peak amplitude a quarter of the way through one bob cycle', () => {
    const quarterPeriodMs = (1000 / DEFAULT_WALK_BOB.frequencyHz) / 4
    const bob = computeWalkBob(quarterPeriodMs)
    expect(bob.yOffset).toBeCloseTo(DEFAULT_WALK_BOB.amplitudePx, 5)
  })

  it('never exceeds the configured amplitude or sway bounds', () => {
    for (let ms = 0; ms < 5000; ms += 37) {
      const bob = computeWalkBob(ms)
      expect(Math.abs(bob.yOffset)).toBeLessThanOrEqual(DEFAULT_WALK_BOB.amplitudePx + 1e-9)
      expect(Math.abs(bob.angleDeg)).toBeLessThanOrEqual(DEFAULT_WALK_BOB.swayDeg + 1e-9)
    }
  })

  it('degrades to a flat zero offset when frequency is zero (edge case)', () => {
    const bob = computeWalkBob(1234, { amplitudePx: 3, frequencyHz: 0, swayDeg: 1 })
    expect(bob.yOffset).toBeCloseTo(0, 5)
  })
})
