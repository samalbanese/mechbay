import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import { ClaudeRunner } from '../../src/main/runners/claude'
import { CodexRunner } from '../../src/main/runners/codex'
import { GeminiRunner } from '../../src/main/runners/gemini'
import { KimiRunner } from '../../src/main/runners/kimi'

/**
 * Model pass-through: RunnerSpawnOptions.model threads through spawn() into
 * each CLI-backed runner's argv. Locks in the exact flag each runtime
 * expects, and confirms the flag is entirely absent when no model is set
 * (so we never pass `--model undefined` or similar).
 */

function makeFakeChild(): EventEmitter & {
  stdout: Readable
  stderr: Readable
  kill: ReturnType<typeof vi.fn>
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable
    stderr: Readable
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = Readable.from([])
  child.stderr = Readable.from([])
  child.kill = vi.fn()
  return child
}

describe('ClaudeRunner model pass-through', () => {
  it('appends --model <model> when a model override is set', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new ClaudeRunner({
      which: async () => '/fake/claude',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'say hi', { model: 'claude-opus-4-8' })
    expect(spawnCalls).toEqual([['claude', ['-p', 'say hi', '--model', 'claude-opus-4-8']]])
  })

  it('omits --model entirely when no override is set', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new ClaudeRunner({
      which: async () => '/fake/claude',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'say hi')
    expect(spawnCalls).toEqual([['claude', ['-p', 'say hi']]])
  })
})

describe('CodexRunner model pass-through', () => {
  it('inserts -m <model> between exec and the prompt', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new CodexRunner({
      which: async () => '/fake/codex',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'refactor this', { model: 'gpt-5.6-terra' })
    expect(spawnCalls).toEqual([['codex', ['exec', '-m', 'gpt-5.6-terra', 'refactor this']]])
  })

  it('omits -m entirely when no override is set', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new CodexRunner({
      which: async () => '/fake/codex',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'refactor this')
    expect(spawnCalls).toEqual([['codex', ['exec', 'refactor this']]])
  })
})

describe('GeminiRunner model pass-through', () => {
  it('appends -m <model> after the existing flags', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new GeminiRunner({
      which: async () => '/fake/gemini',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'summarize', { model: 'gemini-3-pro' })
    expect(spawnCalls).toEqual([
      ['gemini', ['-p', 'summarize', '-o', 'text', '-y', '-m', 'gemini-3-pro']]
    ])
  })

  it('omits -m entirely when no override is set', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new GeminiRunner({
      which: async () => '/fake/gemini',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'summarize')
    expect(spawnCalls).toEqual([['gemini', ['-p', 'summarize', '-o', 'text', '-y']]])
  })
})

describe('KimiRunner model pass-through', () => {
  const SCRIPT = '/fake/abs/path/kimi_fireworks.py'

  it('appends --model <model> after --narrate', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new KimiRunner({
      scriptPath: SCRIPT,
      which: async () => '/fake/python',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'explore', { model: 'kimi-k3' })
    expect(spawnCalls).toEqual([
      ['python', [SCRIPT, '-', '-v', '--narrate', '--model', 'kimi-k3']]
    ])
  })

  it('omits --model entirely when no override is set', async () => {
    const spawnCalls: Array<[string, string[]]> = []
    const child = makeFakeChild()
    const runner = new KimiRunner({
      scriptPath: SCRIPT,
      which: async () => '/fake/python',
      spawnProcess: ((cmd: string, args: string[]) => {
        spawnCalls.push([cmd, args])
        return child
      }) as never
    })

    await runner.spawn('/tmp', 'explore')
    expect(spawnCalls).toEqual([['python', [SCRIPT, '-', '-v', '--narrate']]])
  })
})
