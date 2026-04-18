import { CliRunner } from './base'

/**
 * Moonshot Kimi — invoked as `kimi --print -p "<prompt>"`.
 *
 * `--print`  = non-interactive mode (implicitly enables --yolo).
 * `-p` / `--prompt` = binds the prompt VALUE. Both flags are required:
 * without `-p`, modern Kimi (Click/Typer-based) parses the prompt as
 * a subcommand name and fails with `No such command "<prompt>"`.
 *
 * We intentionally shell out to the native Kimi CLI here, NOT the
 * Fireworks wrapper. Users who only have the Fireworks path available
 * will show up as NOT DEPLOYABLE until they install the native CLI.
 */
export class KimiRunner extends CliRunner {
  protected command = 'kimi'
  protected buildArgs(prompt: string): string[] {
    return ['--print', '-p', prompt]
  }
}
