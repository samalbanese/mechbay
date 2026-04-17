import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { Deployment, DeploymentStatus, LogChunk } from '../shared/types'
import type { StateManager } from './state-manager'
import type { Runner } from './runners/types'
import { ulid } from '../shared/ulid'
import { scanProjects, type DiscoveredProject } from './project-scanner'

export interface IpcDeps {
  win: BrowserWindow
  state: StateManager
  runners: Record<string, Runner>
}

const ACTIVE_STATUSES: DeploymentStatus[] = [
  'walking-to',
  'working',
  'awaiting-input',
  'returning'
]

export function registerIpc(opts: IpcDeps): void {
  const { win, state } = opts

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
        executeDeployment(
          deploymentId,
          companion.family,
          facility.path,
          args.taskPrompt,
          opts
        ).catch((err) => {
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
  family: string,
  cwd: string,
  prompt: string,
  opts: IpcDeps
): Promise<void> {
  const { win, state, runners } = opts
  const runner = runners[family]
  if (!runner) {
    state.updateState((prev) => ({
      ...prev,
      deployments: prev.deployments.map((d) =>
        d.id === deploymentId
          ? {
              ...d,
              status: 'failed',
              completedAt: Date.now(),
              summary: `No runner registered for family: ${family}`
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
    const result = await runner.spawn(cwd, prompt)
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
        executeDeployment(
          queuedId,
          companion.family,
          facility.path,
          nextQueued.taskPrompt,
          opts
        ).catch((err) => {
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
        })
      }
    }
  }
}
