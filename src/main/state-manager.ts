import { EventEmitter } from 'events'
import path from 'path'
import os from 'os'
import type {
  AgentFamily,
  AppState,
  Companion,
  Facility,
  FacilityType,
  MechClass
} from '../shared/types'
import { ulid } from '../shared/ulid'

const STATE_SCHEMA_VERSION = 2

interface MechSeed {
  family: AgentFamily
  mechClass: MechClass
  name: string
  homeTile: { x: number; y: number }
}

const DEFAULT_MECH_MAP: MechSeed[] = [
  { family: 'claude', mechClass: 'atlas', name: 'Atlas-Prime', homeTile: { x: 4, y: 10 } },
  { family: 'codex', mechClass: 'marauder', name: 'Marauder-Prime', homeTile: { x: 6, y: 10 } },
  { family: 'kimi', mechClass: 'raven', name: 'Raven-Prime', homeTile: { x: 8, y: 10 } },
  { family: 'gemini', mechClass: 'catapult', name: 'Catapult-Prime', homeTile: { x: 10, y: 10 } },
  { family: 'hermes', mechClass: 'locust', name: 'Locust-Prime', homeTile: { x: 12, y: 10 } }
]

interface FacilitySeed {
  facilityType: FacilityType
  name: string
  tile: { x: number; y: number }
}

const DEFAULT_FACILITY_MAP: FacilitySeed[] = [
  { facilityType: 'security-bay', name: 'Security Bay', tile: { x: 3, y: 3 } },
  { facilityType: 'research-lab', name: 'Research Lab', tile: { x: 8, y: 3 } },
  { facilityType: 'foundry', name: 'Foundry', tile: { x: 13, y: 3 } },
  { facilityType: 'salvage-dock', name: 'Salvage Dock', tile: { x: 3, y: 13 } },
  { facilityType: 'command-center', name: 'Command Center', tile: { x: 8, y: 6 } },
  { facilityType: 'data-archive', name: 'Data Archive', tile: { x: 13, y: 13 } }
]

function defaultState(userDataDir: string): AppState {
  return {
    version: STATE_SCHEMA_VERSION,
    companions: DEFAULT_MECH_MAP.map((m) => {
      const id = ulid()
      const barracks = path.join(userDataDir, 'mechbay', 'companions', id)
      const companion: Companion = {
        id,
        family: m.family,
        mechClass: m.mechClass,
        name: m.name,
        spriteKey: `mech-${m.mechClass}`,
        homeTile: m.homeTile,
        cliAvailable: false,
        recentDeploymentIds: [],
        soulPath: path.join(barracks, 'soul.md'),
        memoryPath: path.join(barracks, 'memory.md')
      }
      return companion
    }),
    facilities: DEFAULT_FACILITY_MAP.map((f) => {
      // Seed facilities have no associated project path yet — they become
      // usable targets once the Project Scanner (Wave 6) binds them to a
      // real directory, or when the user manually configures one.
      const facility: Facility = {
        id: ulid(),
        facilityType: f.facilityType,
        name: f.name,
        tile: f.tile,
        path: '',
        source: 'manual',
        discoveredAt: Date.now()
      }
      return facility
    }),
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
    const existing = store.has('state') ? (store.get('state') as AppState | undefined) : undefined
    // Reset state whenever the schema version bumps. Seed data (companion home
    // tiles, facility roster) is treated as part of the schema until players
    // can edit it in-app.
    if (!existing || existing.version !== STATE_SCHEMA_VERSION) {
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
