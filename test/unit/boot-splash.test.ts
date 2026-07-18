import { describe, expect, it } from 'vitest'
import { BOOT_LINES, bootTimings } from '../../src/renderer/src/components/boot-splash'

describe('boot splash schedule', () => {
  it('types every line sequentially across the full boot window', () => {
    const timings = bootTimings(false)

    expect(timings.sequenceDuration).toBe(2200)
    expect(timings.fadeDuration).toBe(400)
    expect(timings.lines.map((line) => line.text)).toEqual(BOOT_LINES)
    expect(timings.lines[0].startAt).toBe(0)
    expect(timings.lines.at(-1)?.endAt).toBe(2200)
    timings.lines.slice(1).forEach((line, index) => {
      expect(line.startAt).toBe(timings.lines[index].endAt)
    })
  })

  it('shows the complete text briefly with no animation when motion is reduced', () => {
    const timings = bootTimings(true)

    expect(timings).toMatchObject({
      sequenceDuration: 0,
      holdDuration: 600,
      fadeDuration: 0
    })
    expect(timings.lines.every((line) => line.startAt === 0 && line.endAt === 0)).toBe(true)
  })
})
