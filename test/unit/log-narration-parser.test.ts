import { describe, it, expect } from 'vitest'
import { NarrationParser } from '../../src/main/log-narration-parser'

describe('NarrationParser', () => {
  it('passes through a plain stderr chunk with trailing newline as one record', () => {
    const p = new NarrationParser()
    const out = p.feed({ stream: 'stderr', text: 'hello world\n' })
    expect(out).toEqual([{ stream: 'stderr', text: 'hello world\n' }])
  })

  it('buffers a partial line until the newline arrives', () => {
    const p = new NarrationParser()
    expect(p.feed({ stream: 'stderr', text: 'hello ' })).toEqual([])
    expect(p.feed({ stream: 'stderr', text: 'world\n' })).toEqual([
      { stream: 'stderr', text: 'hello world\n' }
    ])
  })

  it('classifies a line starting with [INTENT] as stream: thought + thoughtKind: intent', () => {
    const p = new NarrationParser()
    const out = p.feed({
      stream: 'stderr',
      text: '[INTENT] Reading package.json first.\n'
    })
    expect(out).toEqual([
      {
        stream: 'thought',
        text: 'Reading package.json first.\n',
        thoughtKind: 'intent'
      }
    ])
  })

  it('classifies a line starting with [FINDINGS] as stream: thought + thoughtKind: findings', () => {
    const p = new NarrationParser()
    const out = p.feed({
      stream: 'stderr',
      text: '[FINDINGS] Electron + Vite project with TS.\n'
    })
    expect(out).toEqual([
      {
        stream: 'thought',
        text: 'Electron + Vite project with TS.\n',
        thoughtKind: 'findings'
      }
    ])
  })

  it('reassembles a marker split across two chunks before classifying', () => {
    const p = new NarrationParser()
    expect(p.feed({ stream: 'stderr', text: '[INT' })).toEqual([])
    const out = p.feed({ stream: 'stderr', text: 'ENT] exploring.\n' })
    expect(out).toEqual([
      {
        stream: 'thought',
        text: 'exploring.\n',
        thoughtKind: 'intent'
      }
    ])
  })

  it('handles case-insensitive markers and an optional colon', () => {
    const p = new NarrationParser()
    expect(
      p.feed({ stream: 'stderr', text: '[intent]: lowercase with colon.\n' })
    ).toEqual([
      {
        stream: 'thought',
        text: 'lowercase with colon.\n',
        thoughtKind: 'intent'
      }
    ])
    expect(
      p.feed({ stream: 'stderr', text: '[Findings] mixed case.\n' })
    ).toEqual([
      {
        stream: 'thought',
        text: 'mixed case.\n',
        thoughtKind: 'findings'
      }
    ])
  })

  it('emits non-marker lines as their original stream', () => {
    const p = new NarrationParser()
    const out = p.feed({
      stream: 'stderr',
      text: '  -> read_file({"path": "x"})\n'
    })
    expect(out).toEqual([
      { stream: 'stderr', text: '  -> read_file({"path": "x"})\n' }
    ])
  })

  it('splits a multi-line chunk into one record per line', () => {
    const p = new NarrationParser()
    const out = p.feed({
      stream: 'stderr',
      text: '[INTENT] plan step.\n  -> run_command(...)\n[FINDINGS] done.\n'
    })
    expect(out).toEqual([
      { stream: 'thought', text: 'plan step.\n', thoughtKind: 'intent' },
      { stream: 'stderr', text: '  -> run_command(...)\n' },
      { stream: 'thought', text: 'done.\n', thoughtKind: 'findings' }
    ])
  })

  it('preserves the line terminator (\\n) in the emitted text', () => {
    const p = new NarrationParser()
    const out = p.feed({ stream: 'stderr', text: 'plain line\n' })
    expect(out[0].text.endsWith('\n')).toBe(true)
  })

  it('does not emit a partial trailing line; flush() emits it as-is (no marker classification)', () => {
    const p = new NarrationParser()
    expect(p.feed({ stream: 'stderr', text: 'incomplete no newline' })).toEqual(
      []
    )
    expect(p.flush()).toEqual([
      { stream: 'stderr', text: 'incomplete no newline' }
    ])
  })

  it('buffers stdout and stderr independently (no cross-stream contamination)', () => {
    const p = new NarrationParser()
    expect(p.feed({ stream: 'stdout', text: 'stdout part ' })).toEqual([])
    expect(p.feed({ stream: 'stderr', text: 'stderr part\n' })).toEqual([
      { stream: 'stderr', text: 'stderr part\n' }
    ])
    expect(p.feed({ stream: 'stdout', text: 'rest\n' })).toEqual([
      { stream: 'stdout', text: 'stdout part rest\n' }
    ])
  })

  it('handles a chunk that contains only a newline', () => {
    const p = new NarrationParser()
    const out = p.feed({ stream: 'stderr', text: '\n' })
    expect(out).toEqual([{ stream: 'stderr', text: '\n' }])
  })

  it('normalizes \\r\\n line endings (Windows stderr) to \\n', () => {
    const p = new NarrationParser()
    const out = p.feed({
      stream: 'stderr',
      text: '[INTENT] on windows\r\n'
    })
    expect(out).toEqual([
      { stream: 'thought', text: 'on windows\n', thoughtKind: 'intent' }
    ])
  })
})
