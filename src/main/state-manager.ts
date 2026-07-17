import { EventEmitter } from 'events'
import path from 'path'
import os from 'os'
import type {
  AgentFamily,
  AppState,
  Companion,
  Deployment,
  DeploymentStatus,
  Facility,
  FacilityType,
  MechClass,
  StateSchemaVersion
} from '../shared/types'
import { ulid } from '../shared/ulid'

const STATE_SCHEMA_VERSION: StateSchemaVersion = 2
const GRID_W = 16
const GRID_H = 16

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

function isValidState(obj: unknown): obj is AppState {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'version' in obj &&
    (obj as AppState).version === STATE_SCHEMA_VERSION &&
    Array.isArray((obj as AppState).companions) &&
    Array.isArray((obj as AppState).facilities) &&
    Array.isArray((obj as AppState).deployments) &&
    Array.isArray((obj as AppState).logChunks) &&
    typeof (obj as AppState).settings === 'object' &&
    (obj as AppState).settings !== null
  )
}

export function repairFacilityTileCollisions(state: AppState): {
  state: AppState
  changed: boolean
} {
  const seen = new Set<string>()
  let changed = false
  const facilities = state.facilities.map((facility) => {
    const key = `${facility.tile.x},${facility.tile.y}`
    if (!seen.has(key)) {
      seen.add(key)
      return facility
    }

    let freeTile: { x: number; y: number } | undefined
    for (let y = 0; y < GRID_H && !freeTile; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!seen.has(`${x},${y}`)) {
          freeTile = { x, y }
          break
        }
      }
    }
    if (!freeTile) return facility

    changed = true
    seen.add(`${freeTile.x},${freeTile.y}`)
    return { ...facility, tile: freeTile }
  })

  return changed ? { state: { ...state, facilities }, changed } : { state, changed }
}

/**
 * StateManager — centralized application state with persistence.
 *
 * ## Events
 *
 * The StateManager extends EventEmitter and emits the following events:
 *
 * ### `stateChanged` → `(state: AppState) => void`
 * Emitted whenever the state is successfully updated. The payload is the
 * new complete AppState. Listeners should treat this as the source of truth.
 *
 * ### `statePersistFailed` → `(state: AppState, err: unknown) => void`
 * Emitted when a state update succeeds in memory but fails to persist to
 * the underlying store. The state parameter is the updated (but not persisted)
 * state; err is the underlying error from the store implementation.
 *
 * @example
 * ```ts
 * stateManager.on('stateChanged', handleStateUpdate)
 * stateManager.on('statePersistFailed', handlePersistFailure)
 * ```
 */
export class StateManager extends EventEmitter {
  private store: StoreLike
  private cache: AppState

  constructor(store: StoreLike, userDataDir: string = os.homedir()) {
    super()
    this.store = store

    let existing: AppState | undefined
    let hasExisting = false

    try {
      hasExisting = store.has('state')
      if (hasExisting) {
        const raw = store.get('state')
        if (isValidState(raw)) {
          existing = raw
        }
      }
    } catch (err) {
      console.error('[state-manager] Store read failed:', err)
      hasExisting = false
      existing = undefined
    }

    // Reset state whenever the schema version bumps. Seed data (companion home
    // tiles, facility roster) is treated as part of the schema until players
    // can edit it in-app.
    if (!existing) {
      try {
        store.set('state', defaultState(userDataDir))
      } catch (err) {
        console.error('[state-manager] Store write failed:', err)
      }
    }

    // Try to read from store, fall back to defaults if that fails
    try {
      const raw = store.get('state')
      if (isValidState(raw)) {
        const repaired = repairFacilityTileCollisions(raw)
        this.cache = repaired.state
        if (repaired.changed) {
          try {
            store.set('state', repaired.state)
          } catch (err) {
            console.error('[state-manager] Store write failed during tile repair:', err)
          }
        }
      } else {
        this.cache = defaultState(userDataDir)
      }
    } catch (err) {
      console.error('[state-manager] Store read failed during init:', err)
      this.cache = defaultState(userDataDir)
    }
  }

  getState(): AppState {
    return this.cache
  }

  updateState(updater: (s: AppState) => AppState): AppState {
    this.cache = updater(this.cache)
    this.emit('stateChanged', this.cache)
    try {
      this.store.set('state', this.cache)
    } catch (err) {
      console.error('[state-manager] Store write failed:', err)
      this.emit('statePersistFailed', this.cache, err)
    }
    return this.cache
  }

  /**
   * Find deployments stuck in an active status (walking-to, working,
   * awaiting-input, returning) from the previous run — these are
   * zombies from a crash or force-quit. Mark each `failed` with a
   * clear summary and return the affected records so the renderer
   * can surface a recovery notice.
   *
   * Idempotent: calling on a freshly-seeded or already-swept state
   * returns an empty array and leaves state untouched.
   */
  sweepZombieDeployments(): Deployment[] {
    const ACTIVE: DeploymentStatus[] = ['walking-to', 'working', 'awaiting-input', 'returning']
    const zombies = this.cache.deployments.filter((d) => ACTIVE.includes(d.status))
    if (zombies.length === 0) return []

    const zombieIds = new Set(zombies.map((z) => z.id))
    const now = Date.now()
    this.updateState((prev) => ({
      ...prev,
      deployments: prev.deployments.map((d) =>
        zombieIds.has(d.id)
          ? {
              ...d,
              status: 'failed' as DeploymentStatus,
              summary: 'Interrupted by app crash',
              completedAt: now
            }
          : d
      )
    }))
    // Return the MUTATED records (with status=failed) so the modal
    // shows consistent info.
    return zombies.map((z) => ({
      ...z,
      status: 'failed' as DeploymentStatus,
      summary: 'Interrupted by app crash',
      completedAt: now
    }))
  }
}
