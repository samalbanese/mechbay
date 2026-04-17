import { useEffect, useState } from 'react'
import type { Companion, Facility } from '../../../shared/types'

/**
 * Modal overlay that collects a task prompt before firing a deploy.
 * Replaces the Wave-1 window.prompt() call with a MechBay Ops styled
 * form — textarea + quick-prompt chips + Deploy/Cancel actions.
 *
 * Keyboard: ESC cancels. Click on the dimmed backdrop cancels.
 * Disabled state: if the companion's CLI isn't available, Deploy is
 * locked and a banner explains why.
 */

interface QuickPrompt {
  label: string
  text: string
}

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    label: 'Explore',
    text: 'Explore this project and summarize its structure, purpose, and recent state.'
  },
  {
    label: 'Review recent changes',
    text: 'Review the most recent git changes and flag any concerns or bugs.'
  },
  {
    label: 'Fix failing tests',
    text: 'Find and fix any currently failing tests. Report what you changed and why.'
  },
  {
    label: 'Add feature',
    text: 'Add a new feature: '
  }
]

export function DeployModal(props: {
  companion: Companion
  facility: Facility
  onDeploy: (prompt: string, quickPrompt?: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [quickUsed, setQuickUsed] = useState<string | undefined>()
  const canDeploy = props.companion.cliAvailable && text.trim().length > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onCancel()
      }}
    >
      <div style={panelStyle}>
        <div style={headerStyle}>
          DEPLOY: {props.companion.name.toUpperCase()} → {props.facility.name.toUpperCase()}
        </div>
        <div style={subheaderStyle}>
          {props.companion.mechClass.toUpperCase()} · {props.companion.family}
        </div>

        {!props.companion.cliAvailable && (
          <div style={bannerStyle}>
            ⚠ {props.companion.family.toUpperCase()} CLI NOT DETECTED · install and restart to deploy
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Task prompt..."
          autoFocus
          style={textareaStyle}
        />

        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={chipLabelStyle}>QUICK PROMPTS</div>
          <div style={chipRowStyle}>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setText(p.text)
                  setQuickUsed(p.label)
                }}
                style={chipStyle}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={actionRowStyle}>
          <button type="button" onClick={props.onCancel} style={cancelButtonStyle}>
            CANCEL
          </button>
          <button
            type="button"
            onClick={() => props.onDeploy(text.trim(), quickUsed)}
            disabled={!canDeploy}
            style={{ ...deployButtonStyle, ...(canDeploy ? {} : deployButtonDisabledStyle) }}
          >
            ⚙ DEPLOY
          </button>
        </div>
      </div>
    </div>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100
}

const panelStyle: React.CSSProperties = {
  background: '#1a1510',
  border: '2px solid #e85f00',
  boxShadow: '0 0 24px rgba(232, 95, 0, 0.3)',
  padding: 24,
  minWidth: 520,
  maxWidth: 640,
  color: '#e85f00',
  fontFamily: '"Courier New", monospace'
}

const headerStyle: React.CSSProperties = {
  fontSize: 14,
  letterSpacing: '0.1em',
  fontWeight: 'bold',
  marginBottom: 2
}

const subheaderStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  letterSpacing: '0.1em',
  marginBottom: 16
}

const bannerStyle: React.CSSProperties = {
  background: '#2a1510',
  border: '1px solid #c44',
  color: '#ff6b6b',
  padding: '8px 12px',
  fontSize: 11,
  letterSpacing: '0.05em',
  marginBottom: 12
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 100,
  background: '#0a0805',
  color: '#eee',
  border: '1px solid #2a2520',
  borderLeft: '2px solid #e85f00',
  padding: 10,
  fontFamily: 'inherit',
  fontSize: 13,
  resize: 'vertical',
  boxSizing: 'border-box'
}

const chipLabelStyle: React.CSSProperties = {
  color: '#ffcc33',
  fontSize: 10,
  letterSpacing: '0.15em',
  marginBottom: 6
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6
}

const chipStyle: React.CSSProperties = {
  background: '#2a2520',
  color: '#ffcc33',
  border: '1px solid #ffcc33',
  padding: '6px 12px',
  fontSize: 11,
  letterSpacing: '0.05em',
  cursor: 'pointer',
  fontFamily: 'inherit'
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10
}

const cancelButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#aaa',
  border: '1px solid #555',
  padding: '8px 20px',
  fontSize: 12,
  letterSpacing: '0.1em',
  cursor: 'pointer',
  fontFamily: 'inherit'
}

const deployButtonStyle: React.CSSProperties = {
  background: '#e85f00',
  color: '#000',
  border: 0,
  padding: '8px 20px',
  fontSize: 12,
  fontWeight: 'bold',
  letterSpacing: '0.1em',
  cursor: 'pointer',
  fontFamily: 'inherit'
}

const deployButtonDisabledStyle: React.CSSProperties = {
  background: '#3a2a1a',
  color: '#666',
  cursor: 'not-allowed'
}
