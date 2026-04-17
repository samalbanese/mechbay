import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import type { AppState, Deployment, LogChunk } from '../../shared/types'
import { BayScene } from './game/BayScene'
import { bus } from './bus'
import { DeployModal } from './components/DeployModal'
import { CrashRecoveryModal } from './components/CrashRecoveryModal'

function App(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [logs, setLogs] = useState<LogChunk[]>([])
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null)
  const [pendingDeploy, setPendingDeploy] = useState<{
    companionId: string
    facilityId: string
  } | null>(null)
  const [recoveryZombies, setRecoveryZombies] = useState<Deployment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canvasParentRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BayScene | null>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  // Subscribe to IPC state + log chunks
  useEffect(() => {
    window.mechbay.getState().then(setState).catch((e) => setError(String(e)))
    const offState = window.mechbay.onStateChange(setState)
    const offLog = window.mechbay.onLogChunk((c) => setLogs((prev) => [...prev.slice(-499), c]))
    const offRecovery = window.mechbay.onRecoveryZombies((zombies) => setRecoveryZombies(zombies))
    return () => {
      offState()
      offLog()
      offRecovery()
    }
  }, [])

  // Mount Phaser once
  useEffect(() => {
    if (!canvasParentRef.current || gameRef.current) return
    const scene = new BayScene()
    sceneRef.current = scene
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: canvasParentRef.current,
      width: canvasParentRef.current.clientWidth || 1100,
      height: 520,
      backgroundColor: '#0a0805',
      scene,
      scale: { mode: Phaser.Scale.RESIZE }
    })

    const offDrop = (payload: { companionId: string; facilityId: string }): void => {
      setPendingDeploy(payload)
    }
    const offSelect = (payload: { companionId: string | null }): void => {
      setSelectedCompanionId(payload.companionId)
    }
    bus.on('dropOnFacility', offDrop)
    bus.on('companionSelected', offSelect)

    return () => {
      bus.off('dropOnFacility', offDrop)
      bus.off('companionSelected', offSelect)
      gameRef.current?.destroy(true)
      gameRef.current = null
      sceneRef.current = null
    }
  }, [])

  // Push state into Phaser whenever it changes
  useEffect(() => {
    if (state) sceneRef.current?.setState(state)
  }, [state])

  if (error) {
    return (
      <div style={shellStyle}>
        <h1>⚙ MECHBAY · BOOT ERROR</h1>
        <pre style={{ color: '#c44' }}>{error}</pre>
      </div>
    )
  }

  const activeCount =
    state?.deployments.filter((d) =>
      ['walking-to', 'working', 'awaiting-input', 'returning'].includes(d.status)
    ).length ?? 0
  const queueCount = state?.deployments.filter((d) => d.status === 'queued').length ?? 0
  const selectedCompanion = state?.companions.find((c) => c.id === selectedCompanionId) ?? null

  return (
    <div style={shellStyle}>
      {/* Top HUD (Wave 2 placeholder, Task 2.3 formalizes) */}
      <div style={hudTopStyle}>
        <span>
          <span style={ledStyle}></span>CMDR SAM · BAY 01
        </span>
        <span>
          MECHS: {state?.companions.length ?? 0} · FACILITIES: {state?.facilities.length ?? 0}
        </span>
        <span style={{ color: queueCount > 0 ? '#ffcc33' : '#e85f00' }}>
          ACTIVE: {activeCount} / {state?.settings.concurrencyCap ?? 3}
          {queueCount > 0 && ` · QUEUE: ${queueCount}`}
        </span>
      </div>

      <div style={mainStyle}>
        <div ref={canvasParentRef} style={canvasParentStyle} />

        {/* Sidebar: companion stats + live log */}
        <div style={sidebarStyle}>
          {selectedCompanion && (
            <div style={sidebarPanelStyle}>
              <div style={{ color: '#ffcc33', fontSize: 11, letterSpacing: '0.15em' }}>
                SELECTED
              </div>
              <div style={{ fontSize: 16, margin: '4px 0' }}>{selectedCompanion.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {selectedCompanion.mechClass.toUpperCase()} · {selectedCompanion.family}
              </div>
              <div style={{ fontSize: 11, marginTop: 6 }}>
                CLI:{' '}
                <span style={{ color: selectedCompanion.cliAvailable ? '#0f0' : '#f44' }}>
                  {selectedCompanion.cliAvailable ? 'AVAILABLE' : '⚠ NOT DEPLOYABLE'}
                </span>
              </div>
            </div>
          )}

          <div style={{ ...sidebarPanelStyle, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#ffcc33', fontSize: 11, letterSpacing: '0.15em', marginBottom: 6 }}>
              LIVE LOG
            </div>
            <pre style={logPaneStyle}>
              {logs.length === 0
                ? '(drag a mech onto a facility to deploy)'
                : logs.map((l) => `[${l.stream}] ${l.text}`).join('')}
            </pre>
          </div>
        </div>
      </div>

      {/* Bottom HUD */}
      <div style={hudBottomStyle}>
        <span>⟨DRAG⟩ DEPLOY · ⟨CLICK⟩ SELECT · ⟨ESC⟩ CANCEL</span>
        <span>{new Date().toLocaleTimeString()}</span>
      </div>

      {recoveryZombies && recoveryZombies.length > 0 && (
        <CrashRecoveryModal
          zombies={recoveryZombies}
          onDismiss={() => setRecoveryZombies(null)}
        />
      )}

      {pendingDeploy && state && (() => {
        const companion = state.companions.find((c) => c.id === pendingDeploy.companionId)
        const facility = state.facilities.find((f) => f.id === pendingDeploy.facilityId)
        if (!companion || !facility) {
          // State drifted (rare) — just dismiss.
          setPendingDeploy(null)
          return null
        }
        return (
          <DeployModal
            companion={companion}
            facility={facility}
            onCancel={() => setPendingDeploy(null)}
            onDeploy={(prompt, quickPrompt) => {
              window.mechbay
                .deployStart({
                  companionId: pendingDeploy.companionId,
                  facilityId: pendingDeploy.facilityId,
                  taskPrompt: prompt,
                  quickPromptUsed: quickPrompt
                })
                .catch((e) =>
                  alert(`Deploy failed: ${e instanceof Error ? e.message : String(e)}`)
                )
              setPendingDeploy(null)
            }}
          />
        )
      })()}
    </div>
  )
}

const HUD_HEIGHT = 32

const shellStyle: React.CSSProperties = {
  fontFamily: '"Courier New", monospace',
  color: '#e85f00',
  background: '#0a0805',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 14
}

const hudBaseStyle: React.CSSProperties = {
  background: '#1a1510',
  borderColor: '#e85f00',
  borderStyle: 'solid',
  padding: '6px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 11,
  letterSpacing: '0.1em',
  height: HUD_HEIGHT
}

const hudTopStyle: React.CSSProperties = {
  ...hudBaseStyle,
  borderWidth: '0 0 2px 0'
}

const hudBottomStyle: React.CSSProperties = {
  ...hudBaseStyle,
  borderWidth: '2px 0 0 0'
}

const ledStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#0f0',
  marginRight: 6
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0
}

const canvasParentStyle: React.CSSProperties = {
  flex: 1,
  background: '#0a0805',
  overflow: 'hidden',
  minWidth: 0
}

const sidebarStyle: React.CSSProperties = {
  width: 360,
  borderLeft: '1px solid #2a2520',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 0
}

const sidebarPanelStyle: React.CSSProperties = {
  background: '#1a1510',
  border: '1px solid #2a2520',
  padding: 10,
  fontSize: 12
}

const logPaneStyle: React.CSSProperties = {
  background: '#0a0805',
  padding: 8,
  flex: 1,
  overflow: 'auto',
  color: '#ccc',
  fontFamily: 'inherit',
  fontSize: 11,
  whiteSpace: 'pre-wrap',
  margin: 0,
  minHeight: 0
}

export default App
