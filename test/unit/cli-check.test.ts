import { describe, it, expect } from 'vitest'
import { runCliAvailabilityCheck } from '../../src/main/cli-check'
import { StateManager, type StoreLike } from '../../src/main/state-manager'
import type { Runner, SpawnResult } from '../../src/main/runners/types'
import type { AgentFamily } from '../../src/shared/types'

function makeInMemoryStore(): StoreLike {
  const data: Record<string, unknown> = {}
  return {
    get: (k: string) => data[k],
    set: (k: string, v: unknown) => {
      data[k] = v
    },
    has: (k: string) => k in data
  }
}

function stubRunner(available: boolean): Runner {
  return {
    isAvailable: async () => available,
    spawn: async (): Promise<SpawnResult> => {
      throw new Error('not used in this test')
    }
  }
}

describe('runCliAvailabilityCheck', () => {
  it('flips cliAvailable=true on companions whose runner reports available', async () => {
    const store = makeInMemoryStore()
    const state = new StateManager(store, '/tmp/cli-check-test')
    // Default seed gives every companion cliAvailable: false.
    expect(state.getState().companions.every((c) => c.cliAvailable === false)).toBe(true)

    const runners: Record<AgentFamily, Runner> = {
      claude: stubRunner(true),
      codex: stubRunner(true),
      kimi: stubRunner(false),
      gemini: stubRunner(true),
      hermes: stubRunner(false)
    }

    await runCliAvailabilityCheck(state, runners)

    const byFamily = Object.fromEntries(
      state.getState().companions.map((c) => [c.family, c.cliAvailable])
    )
    expect(byFamily.claude).toBe(true)
    expect(byFamily.codex).toBe(true)
    expect(byFamily.kimi).toBe(false)
    expect(byFamily.gemini).toBe(true)
    expect(byFamily.hermes).toBe(false)
  })

  it('treats a runner whose probe throws as unavailable (no crash)', async () => {
    const store = makeInMemoryStore()
    const state = new StateManager(store, '/tmp/cli-check-throw')

    const runners: Record<AgentFamily, Runner> = {
      claude: stubRunner(true),
      codex: {
        isAvailable: async () => {
          throw new Error('PATH lookup exploded')
        },
        spawn: async () => {
          throw new Error('not used')
        }
      },
      kimi: stubRunner(false),
      gemini: stubRunner(false),
      hermes: stubRunner(false)
    }

    await expect(runCliAvailabilityCheck(state, runners)).resolves.toBeUndefined()
    const codex = state.getState().companions.find((c) => c.family === 'codex')!
    expect(codex.cliAvailable).toBe(false)
    const claude = state.getState().companions.find((c) => c.family === 'claude')!
    expect(claude.cliAvailable).toBe(true)
  })
})
