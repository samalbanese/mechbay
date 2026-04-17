import { ipcMain, BrowserWindow, dialog } from 'electron'
import path from 'path'
import { IPC } from '../shared/ipc-channels'
import type {
  Companion,
  Deployment,
  DeploymentStatus,
  Facility,
  LogChunk
} from '../shared/types'
import type { StateManager } from './state-manager'
import type { Runner } from './runners/types'
import { ulid } from '../shared/ulid'
import { scanProjects, type DiscoveredProject } from './project-scanner'
import { assembleSystemPrompt, appendMemoryEntry } from './soul-memory'
import type { FsReader, FsNode } from './fs-reader'
import { facilityTypeFromName } from './facility-type-hash'

const GRID_W = 16
const GRID_H = 16

export interface IpcDeps {
  win: BrowserWindow
  state: StateManager
  runners: Record<string, Runner>
  fsReader: FsReader
}

const FS_DIR_IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'out']

const ACTIVE_STATUSES: DeploymentStatus[] = [
  'walking-to',
  'working',
  'awaiting-input',
  'returning'
]

export function registerIpc(opts: IpcDeps): void {
  const { win, state, fsReader } = opts

  // Filesystem: whitelist-guarded read-only access for the File Browser.
  // Handlers simply delegate to FsReader; all security lives there.
  ipcMain.handle(
    IPC.FS_READ_DIR,
    async (_e, args: { path: string }): Promise<FsNode[]> => {
      return fsReader.readDir(args.path, { ignore: FS_DIR_IGNORE })
    }
  )
  ipcMain.handle(
    IPC.FS_READ_FILE,
    async (_e, args: { path: string }): Promise<string> => {
      return fsReader.readFile(args.path)
    }
  )

  // Manual facility placement: user clicked an empty iso tile, we show the
  // OS directory picker, and if they choose one we add a new facility
  // bound to that directory at the clicked tile. The hash-based type
  // selection gives the new facility a stable sprite/archetype without
  // needing user input. Returns the new facility, or null if the user
  // cancelled / the tile was invalid.
  ipcMain.handle(
    IPC.FACILITY_ADD_FROM_PICKER,
    async (_e, args: { tile: { x: number; y: number } }): Promise<Facility | null> => {
      const { tile } = args
      if (
        !Number.isInteger(tile.x) ||
        !Number.isInteger(tile.y) ||
        tile.x < 0 ||
        tile.x >= GRID_W ||
        tile.y < 0 ||
        tile.y >= GRID_H
      ) {
        throw new Error(`Invalid tile (${tile.x}, ${tile.y})`)
      }
      const current = state.getState()
      if (current.facilities.some((f) => f.tile.x === tile.x && f.tile.y === tile.y)) {
        throw new Error(`Tile (${tile.x}, ${tile.y}) is already occupied`)
      }

      const result = await dialog.showOpenDialog(win, {
        title: 'Pick a project directory',
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const picked = result.filePaths[0]
      const name = path.basename(picked)

      const facility: Facility = {
        id: ulid(),
        name,
        path: picked,
        facilityType: facilityTypeFromName(name),
        tile,
        source: 'manual',
        discoveredAt: Date.now()
      }
      state.updateState((prev) => ({ ...prev, facilities: [...prev.facilities, facility] }))
      return facility
    }
  )

  // Broadcast every state change to renderer.
  state.on('stateChanged', (s) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.STATE_SUBSCRIBE, s)
    }
  })

  ipcMain.handle(IPC.STATE_GET, () => state.getState())

  // Project scanner — returns a list of discovered project directories
  // under a given root (defaults to state.settings.projectsDir). The
  // renderer receives raw DiscoveredProject records and decides what to
  // do with them (picker UI, facility binding, etc.). We intentionally
  // DO NOT auto-populate facilities from scan results — how scanned
  // projects map onto the 6 seeded archetype-facilities is a design
  // decision the user needs to make. See docs/overnight-prep/
  // 2026-04-17-project-scanner-facility-binding.md for the analysis.
  ipcMain.handle(
    IPC.SCAN_PROJECTS,
    async (_e, rootDir?: string): Promise<DiscoveredProject[]> => {
      const s = state.getState()
      const root = rootDir ?? s.settings.projectsDir
      const results = await scanProjects(root, s.settings.ignoredMarkers)
      state.updateState((prev) => ({ ...prev, lastScanAt: Date.now() }))
      return results
    }
  )

  ipcMain.handle(
    IPC.DEPLOY_START,
    async (
      _e,
      args: {
        companionId: string
        facilityId: string
        taskPrompt: string
        quickPromptUsed?: string
      }
    ) => {
      const deploymentId = ulid()
      const s = state.getState()
      const companion = s.companions.find((c) => c.id === args.companionId)
      const facility = s.facilities.find((f) => f.id === args.facilityId)
      if (!companion) throw new Error(`Companion not found: ${args.companionId}`)
      if (!facility) throw new Error(`Facility not found: ${args.facilityId}`)

      const activeCount = s.deployments.filter((d) => ACTIVE_STATUSES.includes(d.status)).length
      const status: DeploymentStatus =
        activeCount >= s.settings.concurrencyCap ? 'queued' : 'walking-to'

      const deployment: Deployment = {
        id: deploymentId,
        companionId: companion.id,
        facilityId: facility.id,
        taskPrompt: args.taskPrompt,
        quickPromptUsed: args.quickPromptUsed,
        status,
        startedAt: Date.now()
      }

      state.updateState((prev) => ({
        ...prev,
        deployments: [deployment, ...prev.deployments].slice(0, 200)
      }))

      if (status === 'walking-to') {
        // Fire and forget — execution updates state asynchronously. Attach
        // a catch so sync throws (e.g. runner lookup miss) don't become
        // unhandled rejections; they land in the deployment as 'failed'.
        executeDeployment(deploymentId, companion, facility, args.taskPrompt, opts).catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[ipc] executeDeployment(${deploymentId}) crashed:`, message)
          state.updateState((prev) => ({
            ...prev,
            deployments: prev.deployments.map((d) =>
              d.id === deploymentId
                ? { ...d, status: 'failed', completedAt: Date.now(), summary: message }
                : d
            )
          }))
        })
      }
      return { deploymentId, status }
    }
  )
}

export async function executeDeployment(
  deploymentId: string,
  companion: Companion,
  facility: Facility,
  taskPrompt: string,
  opts: IpcDeps
): Promise<void> {
  const { win, state, runners } = opts
  const runner = runners[companion.family]
  if (!runner) {
    state.updateState((prev) => ({
      ...prev,
      deployments: prev.deployments.map((d) =>
        d.id === deploymentId
          ? {
              ...d,
              status: 'failed',
              completedAt: Date.now(),
              summary: `No runner registered for family: ${companion.family}`
            }
          : d
      )
    }))
    return
  }

  // Transition to working
  state.updateState((prev) => ({
    ...prev,
    deployments: prev.deployments.map((d) =>
      d.id === deploymentId ? { ...d, status: 'working' } : d
    )
  }))

  let exitCode: number
  try {
    // Wrap the task prompt in the companion's soul + memory so every
    // deploy carries personality context + past-run history. If assembly
    // throws (missing files — shouldn't happen after boot scaffolding but
    // belt-and-suspenders), the outer catch below records it as failed.
    const fullPrompt = assembleSystemPrompt(
      companion.name,
      { soulPath: companion.soulPath, memoryPath: companion.memoryPath },
      taskPrompt
    )
    const result = await runner.spawn(facility.path, fullPrompt)
    // Drain stream BEFORE awaiting exit — exit may resolve while chunks
    // are still queued. Sequential await guarantees all chunks reach renderer.
    for await (const chunk of result.stream) {
      const logChunk: LogChunk = {
        id: ulid(),
        deploymentId,
        timestamp: Date.now(),
        stream: chunk.stream,
        text: chunk.text
      }
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.LOG_STREAM, logChunk)
      }
      state.updateState((prev) => ({
        ...prev,
        logChunks: [...prev.logChunks, logChunk].slice(-5000)
      }))
    }
    exitCode = await result.exit
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    state.updateState((prev) => ({
      ...prev,
      deployments: prev.deployments.map((d) =>
        d.id === deploymentId
          ? { ...d, status: 'failed', completedAt: Date.now(), summary: message }
          : d
      )
    }))
    recordMemory(companion, facility, taskPrompt, `Failed before exit. ${message}`)
    return
  }

  const finalStatus: DeploymentStatus = exitCode === 0 ? 'completed' : 'failed'
  state.updateState((prev) => ({
    ...prev,
    deployments: prev.deployments.map((d) =>
      d.id === deploymentId
        ? { ...d, status: finalStatus, exitCode, completedAt: Date.now() }
        : d
    )
  }))

  recordMemory(
    companion,
    facility,
    taskPrompt,
    exitCode === 0 ? `Success. Exit 0.` : `Failed. Exit ${exitCode}.`
  )

  // Auto-advance the next queued deployment if a slot opened.
  // (Wave 4 Task 4.3 expands this; minimal version included here.)
  const after = state.getState()
  const stillActive = after.deployments.filter((d) => ACTIVE_STATUSES.includes(d.status)).length
  if (stillActive < after.settings.concurrencyCap) {
    const nextQueued = after.deployments.find((d) => d.status === 'queued')
    if (nextQueued) {
      const companion = after.companions.find((c) => c.id === nextQueued.companionId)
      const facility = after.facilities.find((f) => f.id === nextQueued.facilityId)
      if (companion && facility) {
        state.updateState((prev) => ({
          ...prev,
          deployments: prev.deployments.map((d) =>
            d.id === nextQueued.id ? { ...d, status: 'walking-to' } : d
          )
        }))
        const queuedId = nextQueued.id
        executeDeployment(queuedId, companion, facility, nextQueued.taskPrompt, opts).catch(
          (err) => {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[ipc] queued executeDeployment(${queuedId}) crashed:`, message)
            state.updateState((prev) => ({
              ...prev,
              deployments: prev.deployments.map((d) =>
                d.id === queuedId
                  ? { ...d, status: 'failed', completedAt: Date.now(), summary: message }
                  : d
              )
            }))
          }
        )
      }
    }
  }
}

/**
 * Append a deploy outcome to the companion's memory.md. Swallows errors
 * (logs only) — a memory-append failure should NEVER break an otherwise
 * successful deploy, so disk issues or path races are best-effort.
 */
function recordMemory(
  companion: Companion,
  facility: Facility,
  task: string,
  outcome: string
): void {
  try {
    appendMemoryEntry(companion.memoryPath, {
      timestamp: new Date(),
      facility: facility.name,
      task,
      outcome
    })
  } catch (err) {
    console.error(`[ipc] appendMemoryEntry(${companion.name}) failed:`, err)
  }
}
