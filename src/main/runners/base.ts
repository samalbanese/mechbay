import { spawn as nodeSpawn, ChildProcess } from 'child_process'
import type { Runner, SpawnResult, RunnerChunk } from './types'

/**
 * Shared plumbing for CLI-backed runners (Claude/Codex/Kimi/Gemini).
 * Subclasses only declare the command name and how to build argv from
 * the prompt — the spawn/stream/abort/error handling is centralized so
 * a fix to one runner automatically fixes all of them.
 *
 * HermesRunner doesn't use this base — it runs a non-CLI backend.
 */

export interface CliRunnerDeps {
  which: (cmd: string) => Promise<string | null>
  spawnProcess?: typeof nodeSpawn
}

export async function defaultWhich(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const checker = nodeSpawn(process.platform === 'win32' ? 'where.exe' : 'which', [cmd])
    let out = ''
    checker.stdout?.on('data', (d) => (out += d.toString()))
    checker.on('exit', (code) => resolve(code === 0 ? out.trim().split(/\r?\n/)[0] : null))
    checker.on('error', () => resolve(null))
  })
}

export abstract class CliRunner implements Runner {
  protected which: (cmd: string) => Promise<string | null>
  protected spawnProcess: typeof nodeSpawn

  constructor(deps: Partial<CliRunnerDeps> = {}) {
    this.which = deps.which ?? defaultWhich
    this.spawnProcess = deps.spawnProcess ?? nodeSpawn
  }

  /** The executable to look up on PATH and invoke. */
  protected abstract command: string
  /** Turn a user prompt into argv for the CLI. */
  protected abstract buildArgs(prompt: string): string[]
  /**
   * Optionally pipe content to the child's stdin and close it.
   * Default: no stdin writes — the runner relies purely on argv.
   * Override to return the prompt string (or a derived payload) when
   * argv is impractical (e.g. multi-KB prompts that risk the Windows
   * ~32k argv ceiling, or a CLI that only accepts stdin).
   */
  protected stdinInput(_prompt: string): string | null {
    return null
  }

  async isAvailable(): Promise<boolean> {
    return (await this.which(this.command)) !== null
  }

  async spawn(cwd: string, prompt: string): Promise<SpawnResult> {
    const child = this.spawnProcess(this.command, this.buildArgs(prompt), { cwd, shell: false })

    const stdinPayload = this.stdinInput(prompt)
    if (stdinPayload !== null && child.stdin) {
      // EPIPE can fire if the child exits before we finish writing
      // (ENOENT, permission error, immediate crash). Swallow silently —
      // the child's exit/error events will surface the real failure
      // through the stream already.
      child.stdin.on('error', () => {})
      try {
        child.stdin.write(stdinPayload)
        child.stdin.end()
      } catch {
        /* already closed */
      }
    }

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
    child.stdout?.on('error', (err) => {
      queue.push({ stream: 'stderr', text: `[stream error] ${err.message}\n` })
      done = true
      wake()
    })
    child.stderr?.on('data', (d) => {
      queue.push({ stream: 'stderr', text: d.toString() })
      wake()
    })
    child.stderr?.on('error', (err) => {
      queue.push({ stream: 'stderr', text: `[stream error] ${err.message}\n` })
      done = true
      wake()
    })
    child.on('close', () => {
      done = true
      wake()
    })
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
