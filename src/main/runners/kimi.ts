import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { CliRunner, type CliRunnerDeps } from './base'

export interface KimiRunnerDeps extends Partial<CliRunnerDeps> {
  /**
   * Absolute path to `kimi_fireworks.py` bundled with the app.
   * Resolved at boot in src/main/index.ts via `app.getAppPath()`.
   */
  scriptPath: string
}

/**
 * Moonshot Kimi via the Fireworks AI API — invoked as:
 *   python <scriptPath> - -v --narrate
 *
 * The prompt is piped via stdin (the trailing `-` argument tells the
 * wrapper to read from stdin). The `-v` flag emits tool-call lines to
 * stderr for the LIVE LOG panel. `--narrate` instructs Kimi to produce
 * `[INTENT]` lines before tool calls and `[FINDINGS]` reflections at
 * subtask boundaries so NarrationParser can render them as thought
 * cards.
 *
 * Why Fireworks and not the native `kimi` CLI:
 *   1. Uncapped usage vs. the native CLI's membership-gated quota.
 *   2. Full agentic loop with 9 baked-in tools (read_file, edit_file,
 *      run_command, grep, etc.) — exactly what the deploy-into-facility
 *      flow needs, no extra wiring in the renderer.
 *   3. The prompt Kimi sees is assembled from soul.md + memory.md + task
 *      which can exceed the Windows argv ceiling; stdin sidesteps that.
 *
 * Auth is pulled from FIREWORKS_API_KEY (env or ~/.claude/env/personal.env
 * as a fallback, per the script). The Electron main process inherits the
 * user's env by default, so no extra wiring is needed.
 */
export class KimiRunner extends CliRunner {
  protected command = 'python'
  private scriptPath: string

  constructor(deps: KimiRunnerDeps) {
    super(deps)
    this.scriptPath = deps.scriptPath
  }

  // A Python-only probe can mark Raven-Prime deployable when the wrapper will fail authentication.
  async isAvailable(): Promise<boolean> {
    const [pythonPath, apiKey] = await Promise.all([this.which(this.command), this.getApiKey()])
    return pythonPath !== null && apiKey !== null
  }

  private async getApiKey(): Promise<string | null> {
    const envKey = process.env.FIREWORKS_API_KEY
    if (envKey) return envKey

    try {
      const contents = await readFile(join(homedir(), '.claude', 'env', 'personal.env'), 'utf8')
      const prefix = 'FIREWORKS_API_KEY='

      for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (line.startsWith(prefix) && !line.startsWith('#')) {
          return line.slice(prefix.length).trim() || null
        }
      }
    } catch {
      return null
    }

    return null
  }

  protected buildArgs(_prompt: string): string[] {
    return [this.scriptPath, '-', '-v', '--narrate']
  }

  protected stdinInput(prompt: string): string | null {
    return prompt
  }
}
