import { useMemo, useState } from 'react'
import type {
  AgentFamily,
  Companion,
  Deployment,
  DeploymentStatus,
  Facility
} from '../../../shared/types'
import { colors, type } from '../theme'

const RUNTIME_OPTIONS: Array<{ value: AgentFamily; label: string }> = [
  { value: 'claude', label: 'CLAUDE CODE' },
  { value: 'codex', label: 'CODEX' },
  { value: 'gemini', label: 'GEMINI CLI' },
  { value: 'kimi', label: 'KIMI (FIREWORKS)' },
  { value: 'hermes', label: 'CUSTOM CLI' }
]

interface CompanionPanelProps {
  companion: Companion | null
  deployments: Deployment[]
  facilities: Facility[]
}

interface DeploymentHistoryItem {
  id: string
  facilityName: string
  status: DeploymentStatus
  startedAt: number
  relativeTime: string
}

export function CompanionPanel({ companion, deployments, facilities }: CompanionPanelProps): React.JSX.Element {
  // Build facility lookup map for O(1) access
  const facilityMap = useMemo(() => {
    const map = new Map<string, Facility>()
    for (const f of facilities) {
      map.set(f.id, f)
    }
    return map
  }, [facilities])

  // Get deployment history for this companion
  const history = useMemo((): DeploymentHistoryItem[] => {
    if (!companion) return []

    const companionDeployments = deployments
      .filter((d) => d.companionId === companion.id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 5)

    return companionDeployments.map((d) => {
      const facility = facilityMap.get(d.facilityId)
      return {
        id: d.id,
        facilityName: facility?.name ?? d.facilityId.slice(0, 8),
        status: d.status,
        startedAt: d.startedAt,
        relativeTime: formatRelativeTime(d.startedAt),
      }
    })
  }, [companion, deployments, facilityMap])

  // Calculate last active time
  const lastActive = useMemo((): string => {
    if (!companion) return ''

    const completedDeployments = deployments.filter(
      (d) => d.companionId === companion.id && d.status === 'completed' && d.completedAt
    )

    if (completedDeployments.length === 0) {
      return 'Never deployed'
    }

    const mostRecent = completedDeployments.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]
    return `Last active: ${formatRelativeTime(mostRecent.completedAt ?? 0)}`
  }, [companion, deployments])

  // Empty state when no companion selected
  if (!companion) {
    return (
      <div style={emptyPanelStyle}>
        <div style={emptyHintStyle}>
          <span style={emptyIconStyle}>◆</span>
          <span>Click a mech to select · Drag to deploy</span>
        </div>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={selectedLabelStyle}>SELECTED</div>
        <div style={nameStyle}>{companion.name}</div>
        <div style={metaStyle}>
          {companion.mechClass.toUpperCase()} · {companion.family}
          {companion.runtime && companion.runtime !== companion.family
            ? ` → ${companion.runtime}`
            : ''}
        </div>
      </div>

      {/* CLI Availability Badge */}
      <div style={badgeRowStyle}>
        {companion.cliAvailable ? (
          <div style={availableBadgeStyle}>
            <span style={availableDotStyle} />
            <span>AVAILABLE</span>
          </div>
        ) : (
          <div style={unavailableBadgeStyle}>
            <span style={unavailableIconStyle}>⚠</span>
            <span>NOT DEPLOYABLE</span>
          </div>
        )}
      </div>

      {/* Runtime reassignment */}
      <RuntimeSection key={companion.id} companion={companion} />

      {/* Last Active */}
      <div style={lastActiveStyle}>{lastActive}</div>

      {/* Deployment History */}
      {history.length > 0 && (
        <div style={historySectionStyle}>
          <div style={historyHeaderStyle}>RECENT DEPLOYMENTS</div>
          <div style={historyListStyle}>
            {history.map((item) => (
              <DeploymentHistoryRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DeploymentHistoryRow({ item }: { item: DeploymentHistoryItem }): React.JSX.Element {
  const statusConfig = getStatusConfig(item.status)

  return (
    <div style={historyRowStyle}>
      <span style={facilityNameStyle}>{item.facilityName}</span>
      <span style={separatorDotStyle}>·</span>
      <span
        style={{
          ...statusDotStyle,
          background: statusConfig.color,
          ...(statusConfig.pulse ? pulseAnimation : {}),
        }}
        aria-label={`Status: ${item.status}`}
      />
      <span style={relativeTimeStyle}>{item.relativeTime}</span>
    </div>
  )
}

function RuntimeSection({ companion }: { companion: Companion }): React.JSX.Element {
  const [runtime, setRuntime] = useState<AgentFamily>(companion.runtime ?? companion.family)
  const [model, setModel] = useState<string>(companion.model ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApply = async (): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      const result = await window.mechbay.configureCompanion({
        companionId: companion.id,
        runtime,
        model: model.trim() || undefined
      })
      if (!result.ok) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div style={runtimeSectionStyle}>
      <div style={runtimeHeaderStyle}>RUNTIME</div>
      <select
        style={runtimeSelectStyle}
        value={runtime}
        disabled={pending}
        onChange={(e) => setRuntime(e.target.value as AgentFamily)}
      >
        {RUNTIME_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.value === companion.family ? ' — DEFAULT' : ''}
          </option>
        ))}
      </select>
      <input
        style={modelInputStyle}
        type="text"
        placeholder="model override (optional)"
        value={model}
        disabled={pending}
        onChange={(e) => setModel(e.target.value)}
      />
      <button
        style={{ ...applyButtonStyle, ...(pending ? applyButtonPendingStyle : {}) }}
        disabled={pending}
        onClick={() => void handleApply()}
      >
        {pending ? 'APPLYING…' : 'APPLY'}
      </button>
      {error && <div style={runtimeErrorStyle}>{error}</div>}
      <div style={runtimeHintStyle}>
        Runtimes use their own auth — claude/codex login, GEMINI_API_KEY, FIREWORKS_API_KEY, or
        your custom CLI&apos;s env. MechBay never stores keys.
      </div>
    </div>
  )
}

function getStatusConfig(status: DeploymentStatus): { color: string; pulse?: boolean } {
  switch (status) {
    case 'queued':
      return { color: colors.statusQueued }
    case 'walking-to':
    case 'returning':
      return { color: colors.statusWalking }
    case 'working':
      return { color: colors.statusWorking, pulse: true }
    case 'awaiting-input':
      return { color: colors.statusAwaitingInput, pulse: true }
    case 'completed':
      return { color: colors.statusCompleted }
    case 'failed':
      return { color: colors.statusFailed }
    default:
      return { color: colors.textMuted }
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// Styles
const panelStyle: React.CSSProperties = {
  background: colors.bgHud,
  border: `1px solid ${colors.borderHud}`,
  padding: 12,
  fontSize: 12,
}

const emptyPanelStyle: React.CSSProperties = {
  ...panelStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 100,
}

const emptyHintStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  color: colors.textMuted,
  fontSize: 11,
  textAlign: 'center',
}

const emptyIconStyle: React.CSSProperties = {
  color: colors.amber,
  fontSize: 16,
}

const headerStyle: React.CSSProperties = {
  marginBottom: 12,
}

const selectedLabelStyle: React.CSSProperties = {
  color: colors.amber,
  fontSize: 10,
  letterSpacing: type.labelTracking,
  marginBottom: 4,
}

const nameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 'bold',
  color: colors.textPrimary,
  marginBottom: 2,
}

const metaStyle: React.CSSProperties = {
  fontSize: 11,
  color: colors.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const badgeRowStyle: React.CSSProperties = {
  marginBottom: 8,
}

const availableBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(77, 175, 80, 0.15)',
  border: `1px solid ${colors.statusWorking}`,
  color: colors.statusWorking,
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 10,
  fontWeight: 'bold',
  letterSpacing: '0.05em',
}

const availableDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: colors.statusWorking,
}

const unavailableBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(255, 82, 82, 0.15)',
  border: `1px solid ${colors.statusFailed}`,
  color: colors.statusFailed,
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 10,
  fontWeight: 'bold',
  letterSpacing: '0.05em',
}

const unavailableIconStyle: React.CSSProperties = {
  fontSize: 10,
}

const lastActiveStyle: React.CSSProperties = {
  fontSize: 11,
  color: colors.textSecondary,
  marginBottom: 12,
  fontStyle: 'italic',
}

const historySectionStyle: React.CSSProperties = {
  borderTop: `1px solid ${colors.borderHud}`,
  paddingTop: 12,
}

const historyHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  color: colors.textMuted,
  letterSpacing: type.labelTracking,
  marginBottom: 8,
}

const historyListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const historyRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
}

const facilityNameStyle: React.CSSProperties = {
  color: colors.textPrimary,
  fontWeight: 'bold',
}

const separatorDotStyle: React.CSSProperties = {
  color: colors.textMuted,
}

const statusDotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
}

const pulseAnimation: React.CSSProperties = {
  animation: 'pulseWorking 2s ease-in-out infinite',
}

const relativeTimeStyle: React.CSSProperties = {
  color: colors.textSecondary,
  fontSize: 10,
  marginLeft: 'auto',
}

const runtimeSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  borderTop: `1px solid ${colors.borderHud}`,
  borderBottom: `1px solid ${colors.borderHud}`,
  padding: '10px 0',
  marginBottom: 12,
}

const runtimeHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  color: colors.amber,
  letterSpacing: type.labelTracking,
  textTransform: 'uppercase',
}

const runtimeSelectStyle: React.CSSProperties = {
  background: colors.bgPanelDark,
  border: `1px solid ${colors.borderHud}`,
  color: colors.textPrimary,
  fontFamily: type.mono,
  fontSize: 11,
  padding: '4px 6px',
}

const modelInputStyle: React.CSSProperties = {
  background: colors.bgPanelDark,
  border: `1px solid ${colors.borderHud}`,
  color: colors.textPrimary,
  fontFamily: type.mono,
  fontSize: 11,
  padding: '4px 6px',
}

const applyButtonStyle: React.CSSProperties = {
  background: colors.amberTint,
  border: `1px solid ${colors.amber}`,
  color: colors.amber,
  fontSize: 10,
  fontWeight: 'bold',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '6px 10px',
  cursor: 'pointer',
}

const applyButtonPendingStyle: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
}

const runtimeErrorStyle: React.CSSProperties = {
  color: colors.statusFailed,
  fontSize: 10,
}

const runtimeHintStyle: React.CSSProperties = {
  color: colors.textMuted,
  fontSize: 10,
  lineHeight: 1.4,
  fontStyle: 'italic',
}
