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
 *
 * Availability: probes `python` on PATH. Users without Python installed
 * will see Raven-Prime rendered as NOT DEPLOYABLE.
 */
export class KimiRunner extends CliRunner {
  protected command = 'python'
  private scriptPath: string

  constructor(deps: KimiRunnerDeps) {
    super(deps)
    this.scriptPath = deps.scriptPath
  }

  protected buildArgs(_prompt: string): string[] {
    return [this.scriptPath, '-', '-v', '--narrate']
  }

  protected stdinInput(prompt: string): string | null {
    return prompt
  }
}
