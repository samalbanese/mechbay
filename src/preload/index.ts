import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc-channels'
import type {
  AppState,
  Deployment,
  DeploymentStatus,
  Facility,
  FsNode,
  LogChunk,
  SoulReadResult,
  SoulWriteResult,
  MemoryReadResult,
  BulkImportRunResult,
  DiscoveredProject,
  CompanionConfigurePayload,
  CompanionConfigureResult
} from '../shared/types'

const mechbayApi = {
  getState: (): Promise<AppState> => ipcRenderer.invoke(IPC.STATE_GET),
  onStateChange: (cb: (s: AppState) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, s: AppState): void => cb(s)
    ipcRenderer.on(IPC.STATE_SUBSCRIBE, handler)
    return () => ipcRenderer.off(IPC.STATE_SUBSCRIBE, handler)
  },
  onLogChunk: (cb: (chunk: LogChunk) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, c: LogChunk): void => cb(c)
    ipcRenderer.on(IPC.LOG_STREAM, handler)
    return () => ipcRenderer.off(IPC.LOG_STREAM, handler)
  },
  deployStart: (args: {
    companionId: string
    facilityId: string
    taskPrompt: string
    quickPromptUsed?: string
  }): Promise<{ deploymentId: string; status: DeploymentStatus }> =>
    ipcRenderer.invoke(IPC.DEPLOY_START, args),
  onRecoveryZombies: (cb: (zombies: Deployment[]) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, zombies: Deployment[]): void => cb(zombies)
    ipcRenderer.on(IPC.RECOVERY_ZOMBIES, handler)
    return () => ipcRenderer.off(IPC.RECOVERY_ZOMBIES, handler)
  },
  fsReadDir: (p: string): Promise<FsNode[]> => ipcRenderer.invoke(IPC.FS_READ_DIR, { path: p }),
  fsReadFile: (p: string): Promise<string> =>
    ipcRenderer.invoke(IPC.FS_READ_FILE, { path: p }),
  addFacilityFromPicker: (tile: { x: number; y: number }): Promise<Facility | null> =>
    ipcRenderer.invoke(IPC.FACILITY_ADD_FROM_PICKER, { tile }),
  // Soul/Memory IPC for Journal tab
  soulRead: (companionId: string): Promise<SoulReadResult> =>
    ipcRenderer.invoke(IPC.SOUL_READ, { companionId }),
  soulWrite: (companionId: string, content: string): Promise<SoulWriteResult> =>
    ipcRenderer.invoke(IPC.SOUL_WRITE, { companionId, content }),
  memoryRead: (companionId: string): Promise<MemoryReadResult> =>
    ipcRenderer.invoke(IPC.MEMORY_READ, { companionId }),
  // Bulk Import IPC
  scanProjects: (rootDir?: string): Promise<DiscoveredProject[]> =>
    ipcRenderer.invoke(IPC.SCAN_PROJECTS, rootDir),
  bulkImportRun: (selectedPaths: string[]): Promise<BulkImportRunResult> =>
    ipcRenderer.invoke(IPC.BULK_IMPORT_RUN, { selectedPaths }),
  // Runtime reassignment IPC
  configureCompanion: (payload: CompanionConfigurePayload): Promise<CompanionConfigureResult> =>
    ipcRenderer.invoke(IPC.COMPANION_CONFIGURE, payload)
}

export type MechBayApi = typeof mechbayApi

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('mechbay', mechbayApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.mechbay = mechbayApi
}
