import type { StateManager } from './state-manager'
import type { Runner } from './runners/types'
import type { AgentFamily } from '../shared/types'

/**
 * Probe each registered runner's `isAvailable()` at boot and write the
 * results into each companion's `cliAvailable` flag. The renderer uses
 * that flag to render a NOT DEPLOYABLE overlay on missing-CLI mechs.
 *
 * Runs in parallel — probes are independent and usually hit `where.exe`
 * or `which`, so ~50-200ms each. Sequential would be 1s+ for 5 mechs.
 */
export async function runCliAvailabilityCheck(
  state: StateManager,
  runners: Record<AgentFamily, Runner>
): Promise<void> {
  const families = Object.keys(runners) as AgentFamily[]
  const probes = await Promise.all(
    families.map(async (family) => {
      try {
        const available = await runners[family].isAvailable()
        return [family, available] as const
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[cli-check] ${family} availability probe threw:`, msg)
        return [family, false] as const
      }
    })
  )
  const availability = Object.fromEntries(probes) as Record<AgentFamily, boolean>

  state.updateState((prev) => ({
    ...prev,
    companions: prev.companions.map((c) => ({
      ...c,
      cliAvailable: availability[c.runtime ?? c.family] ?? false
    }))
  }))
}
