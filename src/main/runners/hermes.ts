import type { Runner, SpawnResult } from './types'

/**
 * Hermes doesn't have a CLI — it uses Sam's existing job submission
 * pipeline. Stubbed until that integration is wired up. isAvailable()
 * returns false so the renderer marks Hermes-Prime as NOT DEPLOYABLE.
 *
 * TODO(post-Wave-4): implement against whatever submit endpoint exists.
 */
export class HermesRunner implements Runner {
  async isAvailable(): Promise<boolean> {
    return false
  }

  async spawn(_cwd: string, _prompt: string): Promise<SpawnResult> {
    throw new Error(
      'HermesRunner: integration TBD — no job-submission backend wired up yet'
    )
  }
}
