import { useEffect, useRef } from 'react'
import type { Companion, Deployment, Facility } from '../../../shared/types'
import { colors, type } from '../theme'

const TASK_LIMIT = 200
const FILE_LIMIT = 20

function truncateTask(task: string): string {
  return task.length > TASK_LIMIT ? `${task.slice(0, TASK_LIMIT)}…` : task
}

function formatDuration(deployment: Deployment): string {
  const end = deployment.completedAt ?? Date.now()
  const totalSeconds = Math.max(0, Math.floor((end - deployment.startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`
}

export function DebriefModal(props: {
  deployment: Deployment
  companion: Companion
  facility: Facility
  onDismiss: () => void
}): React.JSX.Element {
  const dismissButtonRef = useRef<HTMLButtonElement>(null)
  const { deployment } = props
  const diffFiles = deployment.diffFiles
  const visibleFiles = diffFiles?.slice(0, FILE_LIMIT) ?? []
  const hiddenFiles = Math.max(
    0,
    (deployment.diffStats?.filesChanged ?? diffFiles?.length ?? 0) - visibleFiles.length
  )

  useEffect(() => {
    dismissButtonRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter') props.onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onDismiss])

  return (
    <div style={backdropStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-debrief-title"
        style={panelStyle}
      >
        <div id="mission-debrief-title" style={titleStyle}>
          ■ MISSION DEBRIEF — {props.companion.name.toUpperCase()} ←{' '}
          {props.facility.name.toUpperCase()}
        </div>
        <div style={subtitleStyle}>AFTER-ACTION TELEMETRY</div>

        <dl style={detailListStyle}>
          <div style={detailRowStyle}>
            <dt style={labelStyle}>TASK</dt>
            <dd style={taskValueStyle}>{truncateTask(deployment.taskPrompt)}</dd>
          </div>
          <div style={detailRowStyle}>
            <dt style={labelStyle}>DURATION</dt>
            <dd style={valueStyle}>{formatDuration(deployment)}</dd>
          </div>
          <div style={detailRowStyle}>
            <dt style={labelStyle}>EXIT CODE</dt>
            <dd style={valueStyle}>{deployment.exitCode ?? '—'}</dd>
          </div>
          <div style={detailRowStyle}>
            <dt style={labelStyle}>SUMMARY</dt>
            <dd style={summaryValueStyle}>{deployment.summary ?? 'Completed.'}</dd>
          </div>
        </dl>

        {diffFiles === undefined ? (
          <div style={unavailableStyle}>No git repository detected — file diff unavailable.</div>
        ) : (
          <section aria-label="File changes">
            <div style={tableLabelStyle}>FILE DELTA</div>
            {visibleFiles.length === 0 ? (
              <div style={emptyFilesStyle}>NO TRACKED OR UNTRACKED FILE CHANGES</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={pathHeaderStyle}>PATH</th>
                      <th style={numberHeaderStyle}>+INS</th>
                      <th style={numberHeaderStyle}>−DEL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFiles.map((file) => (
                      <tr key={file.path}>
                        <td style={pathCellStyle} title={file.path}>
                          {file.path}
                        </td>
                        <td style={insertionCellStyle}>+{file.insertions}</td>
                        <td style={deletionCellStyle}>−{file.deletions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hiddenFiles > 0 && <div style={moreFilesStyle}>… +{hiddenFiles} more files</div>}
          </section>
        )}

        <div style={actionRowStyle}>
          <button
            ref={dismissButtonRef}
            type="button"
            onClick={props.onDismiss}
            style={dismissButtonStyle}
          >
            ACKNOWLEDGED
          </button>
        </div>
      </div>
    </div>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: colors.overlay,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 110
}

const panelStyle: React.CSSProperties = {
  width: 'min(760px, calc(100vw - 48px))',
  maxHeight: 'calc(100vh - 48px)',
  overflow: 'auto',
  background: colors.bgHud,
  border: `2px solid ${colors.orange}`,
  boxShadow: `0 0 24px ${colors.orangeGlow}`,
  padding: 24,
  color: colors.textPrimary,
  fontFamily: type.mono
}

const titleStyle: React.CSSProperties = {
  color: colors.orange,
  fontSize: 14,
  fontWeight: 'bold',
  letterSpacing: type.labelTracking,
  lineHeight: 1.45
}

const subtitleStyle: React.CSSProperties = {
  color: colors.cyan,
  fontSize: 10,
  fontWeight: 'bold',
  letterSpacing: type.hudTracking,
  marginTop: 6,
  marginBottom: 16
}

const detailListStyle: React.CSSProperties = {
  margin: 0,
  borderTop: `1px solid ${colors.borderHud}`
}

const detailRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '96px minmax(0, 1fr)',
  gap: 12,
  padding: '8px 0',
  borderBottom: `1px solid ${colors.borderHud}`
}

const labelStyle: React.CSSProperties = {
  color: colors.amber,
  fontSize: 10,
  fontWeight: 'bold',
  letterSpacing: type.hudTracking
}

const valueStyle: React.CSSProperties = {
  margin: 0,
  color: colors.textPrimary,
  fontSize: 12
}

const taskValueStyle: React.CSSProperties = {
  ...valueStyle,
  lineHeight: 1.45,
  overflowWrap: 'anywhere'
}

const summaryValueStyle: React.CSSProperties = {
  ...valueStyle,
  color: colors.cyan,
  lineHeight: 1.45
}

const unavailableStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 10,
  background: colors.bgPanelDark,
  border: `1px solid ${colors.borderHud}`,
  color: colors.textSecondary,
  fontSize: 11
}

const tableLabelStyle: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 6,
  color: colors.amber,
  fontSize: 10,
  fontWeight: 'bold',
  letterSpacing: type.hudTracking
}

const tableWrapStyle: React.CSSProperties = {
  maxHeight: 260,
  overflow: 'auto',
  background: colors.bgPanelDark,
  border: `1px solid ${colors.borderHud}`
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11
}

const pathHeaderStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderBottom: `1px solid ${colors.borderHud}`,
  color: colors.textSecondary,
  fontSize: 10,
  letterSpacing: type.hudTracking,
  textAlign: 'left'
}

const numberHeaderStyle: React.CSSProperties = {
  ...pathHeaderStyle,
  textAlign: 'right',
  width: 64
}

const pathCellStyle: React.CSSProperties = {
  maxWidth: 0,
  overflow: 'hidden',
  padding: '6px 10px',
  borderBottom: `1px dotted ${colors.borderHud}`,
  color: colors.textPrimary,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const insertionCellStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: `1px dotted ${colors.borderHud}`,
  color: colors.statusWorking,
  textAlign: 'right',
  whiteSpace: 'nowrap'
}

const deletionCellStyle: React.CSSProperties = {
  ...insertionCellStyle,
  color: colors.statusFailed
}

const emptyFilesStyle: React.CSSProperties = {
  padding: 10,
  background: colors.bgPanelDark,
  border: `1px solid ${colors.borderHud}`,
  color: colors.textSecondary,
  fontSize: 11
}

const moreFilesStyle: React.CSSProperties = {
  marginTop: 6,
  color: colors.textSecondary,
  fontSize: 11
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: 20
}

const dismissButtonStyle: React.CSSProperties = {
  background: colors.orange,
  color: colors.bg,
  border: 0,
  padding: '8px 20px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 'bold',
  letterSpacing: type.hudTracking,
  cursor: 'pointer'
}
