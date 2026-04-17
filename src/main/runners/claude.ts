import { spawn as nodeSpawn, ChildProcess } from 'child_process'
import type { Runner, SpawnResult, RunnerChunk } from './types'

export interface ClaudeRunnerDeps {
  which: (cmd: string) => Promise<string | null>
  spawnProcess?: typeof nodeSpawn
}

async function defaultWhich(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const checker = nodeSpawn(process.platform === 'win32' ? 'where.exe' : 'which', [cmd])
    let out = ''
    checker.stdout?.on('data', (d) => (out += d.toString()))
    checker.on('exit', (code) => resolve(code === 0 ? out.trim().split(/\r?\n/)[0] : null))
    checker.on('error', () => resolve(null))
  })
}

export class ClaudeRunner implements Runner {
  private which: (cmd: string) => Promise<string | null>
  private spawnProcess: typeof nodeSpawn

  constructor(deps: Partial<ClaudeRunnerDeps> = {}) {
    this.which = deps.which ?? defaultWhich
    this.spawnProcess = deps.spawnProcess ?? nodeSpawn
  }

  async isAvailable(): Promise<boolean> {
    return (await this.which('claude')) !== null
  }

  async spawn(cwd: string, prompt: string): Promise<SpawnResult> {
    const child = this.spawnProcess('claude', ['-p', prompt], { cwd, shell: false })

    // Abort must be idempotent — repeat calls or calls after natural exit
    // raise ESRCH on Windows. SIGKILL fallback handles stubborn processes.
    let aborted = false
    const abort = (): void => {
      // `child.exitCode == null` covers both `null` (Node's "not yet
      // exited" value) and `undefined` (mock children in tests).
      if (aborted || child.killed || child.exitCode != null) return
      aborted = true
      try {
        child.kill('SIGTERM')
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        if (!child.killed && child.exitCode === null) {
          try {
            child.kill('SIGKILL')
          } catch {
            /* already gone */
          }
        }
      }, 5000).unref()
    }

    // Surface spawn errors (ENOENT, EPERM, etc.) via both the stream and
    // the exit promise so consumers cannot hang on a missing binary.
    const exit = new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? -1))
      child.on('error', () => resolve(-1))
    })

    return { stream: this.toAsyncStream(child), abort, exit }
  }

  private async *toAsyncStream(child: ChildProcess): AsyncIterable<RunnerChunk> {
    const queue: RunnerChunk[] = []
    let resolveNext: (() => void) | null = null
    let done = false

    const wake = (): void => {
      const r = resolveNext
      resolveNext = null
      r?.()
    }

    child.stdout?.on('data', (d) => {
      queue.push({ stream: 'stdout', text: d.toString() })
      wake()
    })
    child.stderr?.on('data', (d) => {
      queue.push({ stream: 'stderr', text: d.toString() })
      wake()
    })
    child.on('close', () => {
      done = true
      wake()
    })
    // Spawn errors never emit 'close' — queue a synthetic chunk so the
    // consumer sees the failure reason, then terminate the stream.
    child.on('error', (err) => {
      queue.push({ stream: 'stderr', text: `[spawn error] ${err.message}\n` })
      done = true
      wake()
    })

    while (!done || queue.length > 0) {
      while (queue.length > 0) yield queue.shift()!
      if (done) break
      await new Promise<void>((r) => (resolveNext = r))
    }
  }
}
