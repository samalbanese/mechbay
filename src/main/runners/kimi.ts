import { CliRunner } from './base'

/**
 * Moonshot Kimi K2.5 Turbo — invoked as `kimi --print "<prompt>"`.
 * The `--print` flag is Kimi's non-interactive mode.
 *
 * Note: we intentionally shell out to the native Kimi CLI here, NOT the
 * Fireworks wrapper. Users who only have the Fireworks path available
 * will show up as NOT DEPLOYABLE until they install the native CLI.
 */
export class KimiRunner extends CliRunner {
  protected command = 'kimi'
  protected buildArgs(prompt: string): string[] {
    return ['--print', prompt]
  }
}
