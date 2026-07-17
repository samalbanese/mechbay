import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../../src/shared/types'
import {
  repairFacilityTileCollisions,
  StateManager,
  type StoreLike
} from '../../src/main/state-manager'

function makeInMemoryStore(initialState?: AppState): StoreLike & { set: ReturnType<typeof vi.fn> } {
  const data: Record<string, unknown> = initialState ? { state: initialState } : {}
  return {
    get: (key: string) => data[key],
    set: vi.fn((key: string, value: unknown) => {
      data[key] = value
    }),
    has: (key: string) => key in data
  }
}

describe('facility tile collision repair', () => {
  it('keeps the first claimant and relocates later collisions at boot', () => {
    const seeded = new StateManager(makeInMemoryStore(), '/tmp/state-repair-seed').getState()
    const stacked: AppState = {
      ...seeded,
      facilities: seeded.facilities.map((facility, index) =>
        index < 3 ? { ...facility, tile: { x: 0, y: 0 } } : facility
      )
    }
    const store = makeInMemoryStore(stacked)

    const repaired = new StateManager(store, '/tmp/state-repair-test').getState()
    const tiles = repaired.facilities.map((facility) => `${facility.tile.x},${facility.tile.y}`)

    expect(repaired.facilities[0].tile).toEqual({ x: 0, y: 0 })
    expect(new Set(tiles)).toHaveLength(repaired.facilities.length)
    expect(
      repaired.facilities
        .slice(1, 3)
        .every(({ tile }) => tile.x >= 0 && tile.x < 16 && tile.y >= 0 && tile.y < 16)
    ).toBe(true)
    expect(store.set).toHaveBeenCalledTimes(1)

    const persistedSnapshot = structuredClone(repaired)
    new StateManager(store, '/tmp/state-repair-test')
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(store.get('state')).toEqual(persistedSnapshot)
  })

  it('reports unchanged state without cloning it when there are no collisions', () => {
    const state = new StateManager(makeInMemoryStore(), '/tmp/state-repair-pure').getState()
    const result = repairFacilityTileCollisions(state)
    expect(result).toEqual({ state, changed: false })
    expect(result.state).toBe(state)
  })
})
