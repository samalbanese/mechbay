/**
 * Pure unified-diff parser — no fs/git/electron dependencies so it can be
 * unit tested in isolation and imported from either Main (readFilePatch)
 * or the Renderer (DiffViewer) without pulling in Node built-ins.
 */
import type { DiffHunk } from './types'

/**
 * Parses `git diff --unified=N` output (minus the `diff --git`/`index`/
 * `---`/`+++` preamble, which callers don't need) into hunks with per-line
 * old/new line numbers. Anything before the first `@@` header is preamble
 * and is skipped outright, so a content line that happens to start with
 * `--- ` inside a hunk is never mistaken for the file-header line — only
 * genuine pre-hunk lines get dropped.
 */
export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  for (const rawLine of text.split(/\r?\n/)) {
    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine)
    if (hunkMatch) {
      oldNo = Number.parseInt(hunkMatch[1], 10)
      newNo = Number.parseInt(hunkMatch[2], 10)
      current = { header: rawLine, lines: [] }
      hunks.push(current)
      continue
    }
    if (!current) continue // still in the diff --git/index/---/+++ preamble
    if (rawLine.startsWith('\\')) continue // '\ No newline at end of file' — not a content line

    if (rawLine.startsWith('+')) {
      current.lines.push({ kind: 'add', text: rawLine.slice(1), newNo: newNo++ })
    } else if (rawLine.startsWith('-')) {
      current.lines.push({ kind: 'del', text: rawLine.slice(1), oldNo: oldNo++ })
    } else if (rawLine.startsWith(' ')) {
      current.lines.push({ kind: 'ctx', text: rawLine.slice(1), oldNo: oldNo++, newNo: newNo++ })
    }
  }

  return hunks
}
