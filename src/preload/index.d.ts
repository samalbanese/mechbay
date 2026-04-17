import { ElectronAPI } from '@electron-toolkit/preload'
import type { MechBayApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    mechbay: MechBayApi
  }
}
