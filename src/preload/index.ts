import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc-channels'
import type { AppState, Deployment, LogChunk, DeploymentStatus } from '../shared/types'

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
  }
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
