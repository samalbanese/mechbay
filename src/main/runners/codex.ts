import { CliRunner } from './base'

/**
 * OpenAI Codex (GPT-5.4-Codex) — invoked as `codex exec "<prompt>"`.
 * The `exec` subcommand is the non-interactive entry point.
 */
export class CodexRunner extends CliRunner {
  protected command = 'codex'
  protected buildArgs(prompt: string): string[] {
    return ['exec', prompt]
  }
}
