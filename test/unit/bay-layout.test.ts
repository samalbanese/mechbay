import { describe, expect, it } from 'vitest'
import { canvasPointToPage } from '../../src/renderer/src/game/bay-layout'

describe('canvasPointToPage', () => {
  it('accounts for CSS scaling and Scale.FIT page offsets', () => {
    expect(
      canvasPointToPage(
        { x: 550, y: 320 },
        { left: 24, top: 80, width: 825, height: 480 },
        { width: 1100, height: 640 }
      )
    ).toEqual({ x: 436.5, y: 320 })
  })

  it('preserves canvas coordinates when the backing and CSS sizes match', () => {
    expect(
      canvasPointToPage(
        { x: 100, y: 200 },
        { left: 0, top: 0, width: 1280, height: 720 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ x: 100, y: 200 })
  })
})
