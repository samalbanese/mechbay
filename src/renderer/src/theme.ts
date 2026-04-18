/**
 * Centralized color + typography tokens for MechBay.
 * BattleTech for AI agents: dark terminal + orange/amber accents.
 */

export const colors = {
  // Backgrounds
  bg: '#0a0a0a',
  bgPanel: '#111',
  bgPanelDark: '#0a0805',
  bgHud: '#1a1510',

  // Borders
  border: '#2a2a2a',
  borderHud: '#2a2520',

  // Brand colors
  orange: '#e85f00',
  orangeHover: '#ff7a1a',
  orangeGlow: 'rgba(232, 95, 0, 0.4)',
  amber: '#ffcc33',
  amberGlow: 'rgba(255, 204, 51, 0.4)',

  // Stream colors
  streamStdout: '#9dd98a',
  streamStderr: '#ffaa55',
  streamSystem: '#ffcc33',

  // Text
  textPrimary: '#e0e0e0',
  textSecondary: '#888',
  textMuted: '#555',
  textDark: '#666',

  // Status colors
  statusQueued: '#ffcc33',
  statusWalking: '#5599ff',
  statusWorking: '#4caf50',
  statusAwaitingInput: '#ff9800',
  statusCompleted: '#888',
  statusFailed: '#ff5252',

  // LED states
  ledGreen: '#0f0',
  ledAmber: '#ffcc33',
  ledRed: '#ff4444',
}

export const type = {
  mono: "ui-monospace, 'Cascadia Code', Consolas, Menlo, monospace",
  sans: "system-ui, -apple-system, sans-serif",
  labelTracking: '0.15em',
  hudTracking: '0.1em',
}

export const animations = {
  ledPulse: `
    @keyframes ledPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 4px currentColor; }
      50% { opacity: 0.6; box-shadow: 0 0 12px currentColor; }
    }
  `,
  pulseWorking: `
    @keyframes pulseWorking {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `,
}
