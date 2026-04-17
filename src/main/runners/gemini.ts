import { CliRunner } from './base'

/**
 * Google Gemini — invoked as `gemini -p "<prompt>" -o text -y`.
 * - `-p` takes the prompt as a positional-ish arg
 * - `-o text` forces plain-text output (default is styled TTY)
 * - `-y` / --yolo auto-approves tool calls so the CLI doesn't block
 *   waiting for interactive confirmation inside Electron's sandbox
 */
export class GeminiRunner extends CliRunner {
  protected command = 'gemini'
  protected buildArgs(prompt: string): string[] {
    return ['-p', prompt, '-o', 'text', '-y']
  }
}
