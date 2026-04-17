import { CliRunner } from './base'
export type { CliRunnerDeps as ClaudeRunnerDeps } from './base'

/**
 * Anthropic Claude Code — invoked as `claude -p "<prompt>"`.
 * The `-p` flag runs in "print mode" (non-interactive, streams to stdout).
 */
export class ClaudeRunner extends CliRunner {
  protected command = 'claude'
  protected buildArgs(prompt: string): string[] {
    return ['-p', prompt]
  }
}
