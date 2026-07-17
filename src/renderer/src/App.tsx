import { useEffect, useRef, useState, useMemo } from 'react'
import Phaser from 'phaser'
import type { AppState, Deployment } from '../../shared/types'
import { BayScene } from './game/BayScene'
import { bus } from './bus'
import { DeployModal } from './components/DeployModal'
import { CrashRecoveryModal } from './components/CrashRecoveryModal'
import { DebriefModal } from './components/DebriefModal'
import { FileBrowser } from './components/FileBrowser'
import { JournalTab } from './components/JournalTab'
import { BulkImportModal } from './components/BulkImportModal'
import { LogPane } from './components/LogPane'
import { CompanionPanel } from './components/CompanionPanel'
import { HudHeader } from './components/HudHeader'
import { HudFooter } from './components/HudFooter'
import { colors, type } from './theme'

type SidebarTab = 'log' | 'files' | 'journal'

function App(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null)
  const [pendingDeploy, setPendingDeploy] = useState<{
    companionId: string
    facilityId: string
  } | null>(null)
  const [recoveryZombies, setRecoveryZombies] = useState<Deployment[] | null>(null)
  const [browsingFacilityId, setBrowsingFacilityId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SidebarTab>('log')
  const [error, setError] = useState<string | null>(null)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [debriefQueue, setDebriefQueue] = useState<string[]>([])

  const canvasParentRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BayScene | null>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const previousStateRef = useRef<AppState | null>(null)

  // Subscribe to IPC state + log chunks
  useEffect(() => {
    window.mechbay
      .getState()
      .then((initialState) => {
        previousStateRef.current = initialState
        setState(initialState)
      })
      .catch((e) => setError(String(e)))
    const offState = window.mechbay.onStateChange((nextState) => {
      const previousState = previousStateRef.current
      if (previousState) {
        const completedIds = nextState.deployments
          .filter((deployment) => {
            const previousDeployment = previousState.deployments.find(
              (candidate) => candidate.id === deployment.id
            )
            return deployment.status === 'completed' && previousDeployment?.status !== 'completed'
          })
          .map((deployment) => deployment.id)

        if (completedIds.length > 0) {
          setDebriefQueue((queue) => {
            const queuedIds = new Set(queue)
            const newIds = completedIds.filter((id) => !queuedIds.has(id))
            return newIds.length > 0 ? [...queue, ...newIds] : queue
          })
        }
      }
      previousStateRef.current = nextState
      setState(nextState)
    })
    const offRecovery = window.mechbay.onRecoveryZombies((zombies) => setRecoveryZombies(zombies))
    return () => {
      offState()
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
      backgroundColor: '#0a0805',
      scene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1100,
        height: 640
      }
    })
    // Automation hook: smoke scripts (Playwright-Electron) drive the scene
    // directly — e.g. walkTo — instead of pixel-hunting the canvas.
    ;(window as unknown as Record<string, unknown>).__mechbayScene = scene

    const offDrop = (payload: { companionId: string; facilityId: string }): void => {
      setPendingDeploy(payload)
    }
    const offSelect = (payload: { companionId: string | null }): void => {
      setSelectedCompanionId(payload.companionId)
      // Switch to Journal tab when a companion is selected
      if (payload.companionId) {
        setActiveTab('journal')
      }
    }
    const offFacility = (payload: { facilityId: string }): void => {
      setBrowsingFacilityId(payload.facilityId)
      setActiveTab('files')
    }
    const offEmptyTile = (payload: { tile: { x: number; y: number } }): void => {
      window.mechbay
        .addFacilityFromPicker(payload.tile)
        .then((facility) => {
          if (facility) {
            // Auto-open the file browser for the freshly-placed building.
            setBrowsingFacilityId(facility.id)
            setActiveTab('files')
          }
        })
        .catch((e) =>
          alert(`Could not place building: ${e instanceof Error ? e.message : String(e)}`)
        )
    }
    bus.on('dropOnFacility', offDrop)
    bus.on('companionSelected', offSelect)
    bus.on('facilityClicked', offFacility)
    bus.on('emptyTileClicked', offEmptyTile)

    return () => {
      bus.off('dropOnFacility', offDrop)
      bus.off('companionSelected', offSelect)
      bus.off('facilityClicked', offFacility)
      bus.off('emptyTileClicked', offEmptyTile)
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

  const selectedCompanion = state?.companions.find((c) => c.id === selectedCompanionId) ?? null
  const debriefDeployment = state?.deployments.find(
    (deployment) => deployment.id === debriefQueue[0]
  )
  const debriefCompanion = state?.companions.find(
    (companion) => companion.id === debriefDeployment?.companionId
  )
  const debriefFacility = state?.facilities.find(
    (facility) => facility.id === debriefDeployment?.facilityId
  )
  const otherModalOpen = Boolean(
    pendingDeploy || bulkImportOpen || (recoveryZombies && recoveryZombies.length > 0)
  )

  // Build deployment info for log pane separators using Map for O(1) companion lookup
  const deploymentInfo = useMemo(() => {
    if (!state) return []
    const companionMap = new Map(state.companions.map((c) => [c.id, c]))
    return state.deployments.map((d) => ({
      id: d.id,
      companionName: companionMap.get(d.companionId)?.name ?? 'Unknown',
      startedAt: d.startedAt
    }))
  }, [state])

  return (
    <div style={shellStyle}>
      <HudHeader state={state} onBulkImportClick={() => setBulkImportOpen(true)} />

      <div style={mainStyle}>
        <div ref={canvasParentRef} style={canvasParentStyle} />

        {/* Sidebar */}
        <div style={sidebarStyle}>
          <CompanionPanel
            companion={selectedCompanion}
            deployments={state?.deployments ?? []}
            facilities={state?.facilities ?? []}
          />

          <div
            style={{
              ...sidebarPanelStyle,
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={tabRowStyle}>
              <button
                type="button"
                style={activeTab === 'log' ? tabActiveStyle : tabStyle}
                onClick={() => setActiveTab('log')}
              >
                LIVE LOG
              </button>
              {browsingFacilityId && (
                <>
                  <button
                    type="button"
                    style={activeTab === 'files' ? tabActiveStyle : tabStyle}
                    onClick={() => setActiveTab('files')}
                  >
                    FILES
                  </button>
                  <button
                    type="button"
                    style={tabCloseStyle}
                    onClick={() => {
                      setBrowsingFacilityId(null)
                      setActiveTab('log')
                    }}
                    title="Close file browser"
                  >
                    ×
                  </button>
                </>
              )}
              <button
                type="button"
                style={activeTab === 'journal' ? tabActiveStyle : tabStyle}
                onClick={() => setActiveTab('journal')}
              >
                JOURNAL
              </button>
            </div>

            {activeTab === 'log' && (
              <LogPane logs={state?.logChunks ?? []} deployments={deploymentInfo} />
            )}

            {activeTab === 'files' &&
              browsingFacilityId &&
              state &&
              (() => {
                const facility = state.facilities.find((f) => f.id === browsingFacilityId)
                if (!facility)
                  return <div style={{ color: colors.textSecondary }}>Facility not found.</div>
                return <FileBrowser facilityPath={facility.path} facilityName={facility.name} />
              })()}

            {activeTab === 'journal' && <JournalTab companionId={selectedCompanionId} />}
          </div>
        </div>
      </div>

      <HudFooter />

      {recoveryZombies && recoveryZombies.length > 0 && (
        <CrashRecoveryModal zombies={recoveryZombies} onDismiss={() => setRecoveryZombies(null)} />
      )}

      {bulkImportOpen && <BulkImportModal onClose={() => setBulkImportOpen(false)} />}

      {!otherModalOpen && debriefDeployment && debriefCompanion && debriefFacility && (
        <DebriefModal
          deployment={debriefDeployment}
          companion={debriefCompanion}
          facility={debriefFacility}
          onDismiss={() => setDebriefQueue((queue) => queue.slice(1))}
        />
      )}

      {pendingDeploy &&
        state &&
        (() => {
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

const shellStyle: React.CSSProperties = {
  fontFamily: type.mono,
  color: colors.orange,
  background: colors.bgPanelDark,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 14
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0
}

const canvasParentStyle: React.CSSProperties = {
  flex: 1,
  background: colors.bgPanelDark,
  overflow: 'hidden',
  minWidth: 0
}

const sidebarStyle: React.CSSProperties = {
  width: 360,
  borderLeft: `1px solid ${colors.borderHud}`,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 0,
  flexShrink: 0
}

const sidebarPanelStyle: React.CSSProperties = {
  background: colors.bgHud,
  border: `1px solid ${colors.borderHud}`,
  padding: 10,
  fontSize: 12
}

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  marginBottom: 8,
  borderBottom: `1px solid ${colors.borderHud}`
}

const tabStyle: React.CSSProperties = {
  background: 'transparent',
  border: 0,
  borderBottom: '2px solid transparent',
  color: colors.textDark,
  fontSize: 10,
  letterSpacing: type.labelTracking,
  padding: '4px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold'
}

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  color: colors.amber,
  borderBottom: `2px solid ${colors.amber}`
}

const tabCloseStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'transparent',
  border: 0,
  color: colors.textDark,
  fontSize: 14,
  padding: '2px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit'
}

export default App
