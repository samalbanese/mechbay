import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import icon from '../../resources/icon.png?asset'
import { StateManager } from './state-manager'
import { scaffoldSoulAndMemory } from './soul-memory'
import { ClaudeRunner } from './runners/claude'
import { CodexRunner } from './runners/codex'
import { KimiRunner } from './runners/kimi'
import { GeminiRunner } from './runners/gemini'
import { HermesRunner } from './runners/hermes'
import { registerIpc } from './ipc'
import { runCliAvailabilityCheck } from './cli-check'
import { IPC } from '../shared/ipc-channels'
import type { Runner } from './runners/types'
import type { AgentFamily } from '../shared/types'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0805',
    title: 'MechBay',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sam.mechbay')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const win = createWindow()

  // ─── MechBay subsystems ───────────────────────────────────────
  const store = new Store({ name: 'mechbay-state' })
  const state = new StateManager(store, app.getPath('userData'))

  // Scaffold soul.md + memory.md for every companion on boot. Idempotent:
  // only writes templates if the files don't exist. A companion's
  // personality is persistent from this point on — edits to soul.md carry
  // forward, and memory.md accretes on every deploy.
  for (const companion of state.getState().companions) {
    try {
      scaffoldSoulAndMemory(companion.mechClass, companion.name, {
        soulPath: companion.soulPath,
        memoryPath: companion.memoryPath
      })
    } catch (err) {
      console.error(`[boot] scaffoldSoulAndMemory(${companion.name}) failed:`, err)
    }
  }

  const runners: Record<AgentFamily, Runner> = {
    claude: new ClaudeRunner(),
    codex: new CodexRunner(),
    kimi: new KimiRunner(),
    gemini: new GeminiRunner(),
    hermes: new HermesRunner()
  }

  registerIpc({ win, state, runners })

  // Crash recovery: any deployment stuck in an active status is a
  // zombie from a previous crash or force-quit. Mark them failed and
  // send the list to the renderer once it's ready to receive it.
  const zombies = state.sweepZombieDeployments()
  if (zombies.length > 0) {
    const push = (): void => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.RECOVERY_ZOMBIES, zombies)
      }
    }
    // If the page is already loaded when we hit this code path, send
    // immediately; otherwise wait for did-finish-load.
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', push)
    } else {
      push()
    }
  }

  // Probe CLI availability in the background — don't block window show.
  // A missing CLI surfaces as a NOT DEPLOYABLE overlay once the state
  // update lands (usually within a second of boot).
  void runCliAvailabilityCheck(state, runners).catch((err) => {
    console.error('[boot] runCliAvailabilityCheck failed:', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
