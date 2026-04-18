import { colors, type } from '../theme'

const HUD_HEIGHT = 36

export function HudFooter(): React.JSX.Element {
  return (
    <div style={hudBottomStyle}>
      <span style={hudHintStyle}>
        ⟨DRAG⟩ DEPLOY · ⟨CLICK MECH⟩ SELECT · ⟨CLICK FACILITY⟩ BROWSE · ⟨CLICK EMPTY TILE⟩ PLACE BUILDING
      </span>
      <span style={hudTimeStyle}>{new Date().toLocaleTimeString()}</span>
    </div>
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

const hudBottomStyle: React.CSSProperties = {
  ...hudBaseStyle,
  borderWidth: '2px 0 0 0',
  justifyContent: 'space-between',
}

const hudHintStyle: React.CSSProperties = {
  letterSpacing: type.hudTracking,
  fontSize: 10,
  color: colors.textMuted,
}

const hudTimeStyle: React.CSSProperties = {
  letterSpacing: type.hudTracking,
  fontSize: 10,
  color: colors.textSecondary,
}
