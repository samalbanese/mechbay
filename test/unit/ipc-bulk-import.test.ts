import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../src/shared/ipc-channels'
import { StateManager, type StoreLike } from '../../src/main/state-manager'

const registeredHandlers = new Map<string, (event: unknown, payload: any) => unknown>()

vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, payload: any) => unknown) => {
      registeredHandlers.set(channel, handler)
    })
  },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: class {}
}))

import { registerIpc } from '../../src/main/ipc'

function makeInMemoryStore(): StoreLike {
  const data: Record<string, unknown> = {}
  return {
    get: (key) => data[key],
    set: (key, value) => {
      data[key] = value
    },
    has: (key) => key in data
  }
}

function makeFakeWin(): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  } as unknown as BrowserWindow
}

describe('IPC.BULK_IMPORT_RUN facility placement', () => {
  beforeEach(() => registeredHandlers.clear())

  it('places every imported project on a distinct unoccupied tile', async () => {
    const state = new StateManager(makeInMemoryStore(), '/tmp/ipc-bulk-import-test')
    const preExistingTiles = new Set(
      state.getState().facilities.map((facility) => `${facility.tile.x},${facility.tile.y}`)
    )
    registerIpc({
      win: makeFakeWin(),
      state,
      runners: {} as never,
      fsReader: { readDir: vi.fn(), readFile: vi.fn(), updateWhitelist: vi.fn() } as never
    })
    const handler = registeredHandlers.get(IPC.BULK_IMPORT_RUN)
    if (!handler) throw new Error('BULK_IMPORT_RUN handler was not registered')

    const result = await handler(
      {},
      {
        selectedPaths: ['C:/fake/alpha', 'C:/fake/bravo', 'C:/fake/charlie']
      }
    )

    expect(result).toMatchObject({ ok: true, imported: 3 })
    const imported = state.getState().facilities.slice(-3)
    const importedTiles = imported.map((facility) => `${facility.tile.x},${facility.tile.y}`)
    expect(new Set(importedTiles)).toHaveLength(3)
    expect(importedTiles.every((tile) => !preExistingTiles.has(tile))).toBe(true)
  })
})
