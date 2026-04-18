import { useMemo } from 'react'
import type { AppState } from '../../../shared/types'
import { colors, type, animations } from '../theme'

interface HudHeaderProps {
  state: AppState | null
  onBulkImportClick: () => void
}

const HUD_HEIGHT = 36

export function HudHeader({ state, onBulkImportClick }: HudHeaderProps): React.JSX.Element {
  const activeCount =
    state?.deployments.filter((d) =>
      ['walking-to', 'working', 'awaiting-input', 'returning'].includes(d.status)
    ).length ?? 0
  const queueCount = state?.deployments.filter((d) => d.status === 'queued').length ?? 0
  const failedCount = state?.deployments.filter((d) => d.status === 'failed').length ?? 0
  const concurrencyCap = state?.settings.concurrencyCap ?? 3

  // Determine LED color based on fleet state
  const ledColor = useMemo((): { color: string; pulse: boolean } => {
    if (failedCount > 0) return { color: colors.ledRed, pulse: true }
    if (queueCount > 0) return { color: colors.ledAmber, pulse: true }
    if (activeCount > 0) return { color: colors.ledGreen, pulse: true }
    return { color: colors.ledGreen, pulse: false }
  }, [activeCount, queueCount, failedCount])

  // Determine active counter color
  const activeCounterColor = useMemo((): string => {
    if (activeCount >= concurrencyCap) return colors.amber
    return colors.statusWorking
  }, [activeCount, concurrencyCap])

  return (
    <>
      <div style={hudTopStyle}>
        <div style={hudGroupStyle}>
          <span
            style={{
              ...ledStyle,
              background: ledColor.color,
              boxShadow: ledColor.pulse ? `0 0 8px ${ledColor.color}` : 'none',
              animation: ledColor.pulse ? 'ledPulse 2s ease-in-out infinite' : 'none',
            }}
          />
          <span style={hudLabelStyle}>CMDR SAM · BAY 01</span>
        </div>

        <div style={hudDividerStyle} />

        <div style={hudGroupStyle}>
          <span style={hudLabelStyle}>
            MECHS: <span style={hudValueStyle}>{state?.companions.length ?? 0}</span>
          </span>
          <span style={hudLabelStyle}>
            FACILITIES: <span style={hudValueStyle}>{state?.facilities.length ?? 0}</span>
          </span>
        </div>

        <div style={hudDividerStyle} />

        <div style={hudGroupStyle}>
          <button
            type="button"
            onClick={onBulkImportClick}
            style={bulkImportButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.orangeHover
              e.currentTarget.style.borderColor = colors.orangeHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = colors.orange
            }}
          >
            ⟳ BULK IMPORT
          </button>

          <div style={activeCounterStyle}>
            <span style={{ ...hudLabelStyle, color: activeCounterColor }}>
              ACTIVE: {activeCount}/{concurrencyCap}
            </span>
            <div style={miniBarContainerStyle}>
              <div
                style={{
                  ...miniBarFillStyle,
                  width: `${Math.min((activeCount / concurrencyCap) * 100, 100)}%`,
                  background: activeCounterColor,
                }}
              />
            </div>
            {queueCount > 0 && (
              <span style={queueBadgeStyle}>QUEUE: {queueCount}</span>
            )}
          </div>
        </div>
      </div>

      {/* Global keyframes for LED pulse animation */}
      <style>{animations.ledPulse}{animations.pulseWorking}</style>
    </>
  )
}

const hudBaseStyle: React.CSSProperties = {
  background: colors.bgHud,
  borderColor: colors.orange,
  borderStyle: 'solid',
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  fontSize: 11,
  height: HUD_HEIGHT,
  flexShrink: 0,
}

const hudTopStyle: React.CSSProperties = {
  ...hudBaseStyle,
  borderWidth: '0 0 2px 0',
  justifyContent: 'space-between',
  gap: 16,
}

const hudGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const hudDividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: colors.borderHud,
}

const hudLabelStyle: React.CSSProperties = {
  letterSpacing: type.hudTracking,
  textTransform: 'uppercase',
  color: colors.textSecondary,
  fontSize: 11,
}

const hudValueStyle: React.CSSProperties = {
  color: colors.textPrimary,
  fontWeight: 'bold',
}

const ledStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: 8,
  flexShrink: 0,
}

const bulkImportButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: colors.textPrimary,
  border: `1px solid ${colors.orange}`,
  padding: '4px 12px',
  fontSize: 10,
  fontWeight: 'bold',
  letterSpacing: type.hudTracking,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  transition: 'all 0.15s ease',
}

const activeCounterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const miniBarContainerStyle: React.CSSProperties = {
  width: 40,
  height: 4,
  background: colors.border,
  borderRadius: 2,
  overflow: 'hidden',
}

const miniBarFillStyle: React.CSSProperties = {
  height: '100%',
  transition: 'width 0.3s ease, background 0.3s ease',
}

const queueBadgeStyle: React.CSSProperties = {
  color: colors.amber,
  fontSize: 10,
  letterSpacing: type.hudTracking,
}
