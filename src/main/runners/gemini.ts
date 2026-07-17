import { CliRunner } from './base'

/**
 * Google Gemini — invoked as `gemini -o text -y [-m <model>]` with the
 * prompt piped through stdin.
 * - `-o text` forces plain-text output (default is styled TTY)
 * - `-y` / --yolo auto-approves tool calls so the CLI doesn't block
 *   waiting for interactive confirmation inside Electron's sandbox
 */
export class GeminiRunner extends CliRunner {
  protected command = 'gemini'
  protected buildArgs(_prompt: string, model?: string): string[] {
    return ['-o', 'text', '-y', ...(model ? ['-m', model] : [])]
  }

  protected stdinInput(prompt: string): string | null {
    return prompt
  }
}
