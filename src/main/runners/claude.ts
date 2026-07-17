import { CliRunner } from './base'
export type { CliRunnerDeps as ClaudeRunnerDeps } from './base'

/**
 * Anthropic Claude Code — invoked as `claude -p [--model <model>]` with
 * the prompt piped through stdin. `-p` runs in print mode (non-interactive,
 * streams to stdout).
 */
export class ClaudeRunner extends CliRunner {
  protected command = 'claude'
  protected buildArgs(_prompt: string, model?: string): string[] {
    return ['-p', ...(model ? ['--model', model] : [])]
  }

  protected stdinInput(prompt: string): string | null {
    return prompt
  }
}
