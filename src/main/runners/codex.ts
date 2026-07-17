import { CliRunner } from './base'

/**
 * OpenAI Codex CLI — invoked as
 * `codex exec [-m <model>] -` with the prompt piped through stdin. `exec`
 * is the non-interactive entry point and the trailing `-` selects stdin.
 */
export class CodexRunner extends CliRunner {
  protected command = 'codex'
  protected buildArgs(_prompt: string, model?: string): string[] {
    return ['exec', ...(model ? ['-m', model] : []), '-']
  }

  protected stdinInput(prompt: string): string | null {
    return prompt
  }
}
