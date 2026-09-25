import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from '../../src/shared/diff-parse'

describe('parseUnifiedDiff', () => {
  it('parses a single hunk into add/del/ctx lines with old/new line numbers', () => {
    const diff = [
      'diff --git a/tracked.txt b/tracked.txt',
      'index 1111111..2222222 100644',
      '--- a/tracked.txt',
      '+++ b/tracked.txt',
      '@@ -1,3 +1,3 @@',
      ' line one',
      '-line two',
      '+updated line',
      '+added line',
      ''
    ].join('\n')

    const hunks = parseUnifiedDiff(diff)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].header).toBe('@@ -1,3 +1,3 @@')
    expect(hunks[0].lines).toEqual([
      { kind: 'ctx', text: 'line one', oldNo: 1, newNo: 1 },
      { kind: 'del', text: 'line two', oldNo: 2 },
      { kind: 'add', text: 'updated line', newNo: 2 },
      { kind: 'add', text: 'added line', newNo: 3 }
    ])
  })

  it('parses multiple hunks in the same file, resetting line counters per hunk header', () => {
    const diff = [
      'diff --git a/notes.txt b/notes.txt',
      'index 1111111..2222222 100644',
      '--- a/notes.txt',
      '+++ b/notes.txt',
      '@@ -1,2 +1,2 @@',
      '-first',
      '+first revised',
      ' second',
      '@@ -10,2 +10,2 @@',
      '-tenth',
      '+tenth revised',
      ' eleventh',
      ''
    ].join('\n')

    const hunks = parseUnifiedDiff(diff)

    expect(hunks).toHaveLength(2)
    expect(hunks[0].lines[0]).toEqual({ kind: 'del', text: 'first', oldNo: 1 })
    expect(hunks[1].lines[0]).toEqual({ kind: 'del', text: 'tenth', oldNo: 10 })
  })

  it('drops the "no newline at end of file" marker instead of rendering it as a line', () => {
    const diff = [
      'diff --git a/eof.txt b/eof.txt',
      'index 1111111..2222222 100644',
      '--- a/eof.txt',
      '+++ b/eof.txt',
      '@@ -1 +1 @@',
      '-old',
      '\\ No newline at end of file',
      '+new',
      '\\ No newline at end of file',
      ''
    ].join('\n')

    const hunks = parseUnifiedDiff(diff)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines).toEqual([
      { kind: 'del', text: 'old', oldNo: 1 },
      { kind: 'add', text: 'new', newNo: 1 }
    ])
  })

  it('returns no hunks for input with no @@ header (unhappy path)', () => {
    expect(parseUnifiedDiff('')).toEqual([])
    expect(parseUnifiedDiff('diff --git a/x b/x\nindex 111..222 100644\n')).toEqual([])
  })
})
