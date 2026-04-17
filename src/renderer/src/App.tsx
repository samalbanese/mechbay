import { useEffect, useState } from 'react'
import type { AppState, LogChunk } from '../../shared/types'

function App(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [logs, setLogs] = useState<LogChunk[]>([])
  const [prompt, setPrompt] = useState('echo hello from claude')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.mechbay.getState().then(setState).catch((e) => setError(String(e)))
    const offState = window.mechbay.onStateChange(setState)
    const offLog = window.mechbay.onLogChunk((c) => setLogs((prev) => [...prev, c]))
    return () => {
      offState()
      offLog()
    }
  }, [])

  if (error) {
    return (
      <div style={shellStyle}>
        <h1>⚙ MECHBAY · BOOT ERROR</h1>
        <pre style={{ color: '#c44' }}>{error}</pre>
      </div>
    )
  }

  if (!state) return <div style={shellStyle}>⚙ MECHBAY · LOADING…</div>

  const claude = state.companions.find((c) => c.family === 'claude')
  const firstFacility = state.facilities[0]
  const activeCount = state.deployments.filter((d) =>
    ['walking-to', 'working', 'awaiting-input', 'returning'].includes(d.status)
  ).length

  async function deploy(): Promise<void> {
    if (!claude) {
      alert('No Claude companion found in state.')
      return
    }
    if (!firstFacility) {
      alert(
        'No facilities. Add one to state.json manually for now (see HANDOFF.md or Wave 1 Task 1.7).'
      )
      return
    }
    try {
      await window.mechbay.deployStart({
        companionId: claude.id,
        facilityId: firstFacility.id,
        taskPrompt: prompt
      })
    } catch (e) {
      alert(`Deploy failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div style={shellStyle}>
      <h1 style={{ borderBottom: '2px solid #e85f00', paddingBottom: 8, marginTop: 0 }}>
        ⚙ MECHBAY · WAVE 1 PLUMBING
      </h1>

      <div style={statRowStyle}>
        <Stat label="COMPANIONS" value={state.companions.length} />
        <Stat label="FACILITIES" value={state.facilities.length} />
        <Stat label="ACTIVE" value={`${activeCount} / ${state.settings.concurrencyCap}`} />
        <Stat label="QUEUE" value={state.deployments.filter((d) => d.status === 'queued').length} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong style={{ color: '#ffcc33' }}>{claude?.name ?? 'Atlas-Prime'}</strong>{' '}
        <span style={{ color: '#888' }}>
          → {firstFacility ? firstFacility.name : '(no facility seeded)'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={inputStyle}
          placeholder="Task prompt for Claude…"
        />
        <button onClick={deploy} style={buttonStyle} disabled={!claude || !firstFacility}>
          DEPLOY ATLAS-PRIME
        </button>
      </div>

      <h2 style={{ color: '#ffcc33', marginTop: 24 }}>LIVE LOG</h2>
      <pre style={logPaneStyle}>
        {logs.length === 0
          ? '(no log chunks yet — deploy to see streamed Claude output)'
          : logs.map((l) => `[${l.stream}] ${l.text}`).join('')}
      </pre>

      <h2 style={{ color: '#ffcc33', marginTop: 24 }}>DEPLOYMENTS</h2>
      <pre style={logPaneStyle}>
        {state.deployments.length === 0
          ? '(no deployments yet)'
          : state.deployments
              .slice(0, 10)
              .map(
                (d) =>
                  `${d.status.padEnd(15)} ${new Date(d.startedAt).toISOString().slice(11, 19)}  ${d.taskPrompt.slice(0, 60)}`
              )
              .join('\n')}
      </pre>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }): React.JSX.Element {
  return (
    <div style={{ marginRight: 24 }}>
      <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 18, color: '#e85f00' }}>{value}</div>
    </div>
  )
}

const shellStyle: React.CSSProperties = {
  fontFamily: '"Courier New", monospace',
  padding: 24,
  color: '#e85f00',
  background: '#0a0805',
  minHeight: '100vh',
  fontSize: 14
}

const statRowStyle: React.CSSProperties = {
  display: 'flex',
  marginBottom: 16,
  padding: 12,
  background: '#1a1510',
  border: '1px solid #2a2520'
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: '#1a1510',
  color: '#fff',
  border: '1px solid #e85f00',
  padding: '8px 12px',
  fontFamily: 'inherit',
  fontSize: 14
}

const buttonStyle: React.CSSProperties = {
  background: '#e85f00',
  color: '#000',
  border: 0,
  padding: '8px 20px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 'bold',
  cursor: 'pointer',
  letterSpacing: '0.05em'
}

const logPaneStyle: React.CSSProperties = {
  background: '#1a1510',
  border: '1px solid #2a2520',
  padding: 12,
  maxHeight: 240,
  overflow: 'auto',
  color: '#ccc',
  fontFamily: 'inherit',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  margin: 0
}

export default App
