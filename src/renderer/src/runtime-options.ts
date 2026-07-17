import type { AgentFamily } from '../../shared/types'

export const RUNTIME_OPTIONS: Array<{ value: AgentFamily; label: string }> = [
  { value: 'claude', label: 'CLAUDE CODE' },
  { value: 'codex', label: 'CODEX' },
  { value: 'gemini', label: 'GEMINI CLI' },
  { value: 'kimi', label: 'KIMI (FIREWORKS)' },
  { value: 'hermes', label: 'CUSTOM CLI' }
]

export const RUNTIME_ENV: Partial<Record<AgentFamily, string>> = {
  codex: 'OPENAI_API_KEY',
  kimi: 'FIREWORKS_API_KEY',
  gemini: 'GEMINI_API_KEY',
  hermes: 'MECHBAY_HERMES_API_KEY'
}
