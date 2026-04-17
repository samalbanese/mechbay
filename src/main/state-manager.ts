import { EventEmitter } from 'events'
import path from 'path'
import os from 'os'
import type { AgentFamily, AppState, Companion, MechClass } from '../shared/types'
import { ulid } from '../shared/ulid'

interface MechSeed {
  family: AgentFamily
  mechClass: MechClass
  name: string
}

const DEFAULT_MECH_MAP: MechSeed[] = [
  { family: 'claude', mechClass: 'atlas', name: 'Atlas-Prime' },
  { family: 'codex', mechClass: 'marauder', name: 'Marauder-Prime' },
  { family: 'kimi', mechClass: 'raven', name: 'Raven-Prime' },
  { family: 'gemini', mechClass: 'catapult', name: 'Catapult-Prime' },
  { family: 'hermes', mechClass: 'locust', name: 'Locust-Prime' }
]

function defaultHomeTile(i: number): { x: number; y: number } {
  // Cluster mechs along the left edge of the bay grid
  return { x: 2 + i * 2, y: 12 }
}

function defaultState(userDataDir: string): AppState {
  return {
    version: 1,
    companions: DEFAULT_MECH_MAP.map((m, i) => {
      const id = ulid()
      const barracks = path.join(userDataDir, 'mechbay', 'companions', id)
      const companion: Companion = {
        id,
        family: m.family,
        mechClass: m.mechClass,
        name: m.name,
        spriteKey: `mech-${m.mechClass}`,
        homeTile: defaultHomeTile(i),
        cliAvailable: false,
        recentDeploymentIds: [],
        soulPath: path.join(barracks, 'soul.md'),
        memoryPath: path.join(barracks, 'memory.md')
      }
      return companion
    }),
    facilities: [],
    deployments: [],
    logChunks: [],
    settings: {
      projectsDir: path.join(os.homedir(), 'Projects'),
      concurrencyCap: 3,
      ignoredMarkers: [
        'node_modules',
        'dist',
        'build',
        '.next',
        '__pycache__',
        'Archived Projects DO NOT SCAN'
      ],
      companionNameOverrides: {}
    }
  }
}

export interface StoreLike {
  get: (k: string) => unknown
  set: (k: string, v: unknown) => void
  has: (k: string) => boolean
}

export class StateManager extends EventEmitter {
  private store: StoreLike
  private cache: AppState

  constructor(store: StoreLike, userDataDir: string = os.homedir()) {
    super()
    this.store = store
    if (!store.has('state')) {
      store.set('state', defaultState(userDataDir))
    }
    this.cache = store.get('state') as AppState
  }

  getState(): AppState {
    return this.cache
  }

  updateState(updater: (s: AppState) => AppState): AppState {
    this.cache = updater(this.cache)
    this.store.set('state', this.cache)
    this.emit('stateChanged', this.cache)
    return this.cache
  }
}
