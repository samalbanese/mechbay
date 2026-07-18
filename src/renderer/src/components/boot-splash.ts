export const BOOT_LINES = [
  'MECHBAY OS v1.3.0 — COMBINE STANDARD BOOT',
  '▸ HUD SUBSYSTEMS ................ OK',
  '▸ ISO GRID PROJECTOR ............ OK',
  '▸ RUNNER BOUNDARY ............... OK',
  '▸ SOUL/MEMORY ARCHIVE ........... OK',
  '▸ COMPANION ROSTER .............. 5 MECHS',
  '◈ COMMAND AUTHORITY CONFIRMED — CMDR ON DECK'
] as const

const TYPE_DURATION_MS = 2200
const REDUCED_HOLD_MS = 600
const FADE_DURATION_MS = 400

export interface BootLineTiming {
  text: string
  startAt: number
  endAt: number
}

export interface BootTimings {
  sequenceDuration: number
  holdDuration: number
  fadeDuration: number
  lines: BootLineTiming[]
}

export function bootTimings(reduceMotion: boolean): BootTimings {
  if (reduceMotion) {
    return {
      sequenceDuration: 0,
      holdDuration: REDUCED_HOLD_MS,
      fadeDuration: 0,
      lines: BOOT_LINES.map((text) => ({ text, startAt: 0, endAt: 0 }))
    }
  }

  const characterCount = BOOT_LINES.reduce((total, line) => total + line.length, 0)
  let elapsedCharacters = 0
  const lines = BOOT_LINES.map((text) => {
    const startAt = Math.round((elapsedCharacters / characterCount) * TYPE_DURATION_MS)
    elapsedCharacters += text.length
    return {
      text,
      startAt,
      endAt: Math.round((elapsedCharacters / characterCount) * TYPE_DURATION_MS)
    }
  })

  return {
    sequenceDuration: TYPE_DURATION_MS,
    holdDuration: 0,
    fadeDuration: FADE_DURATION_MS,
    lines
  }
}
