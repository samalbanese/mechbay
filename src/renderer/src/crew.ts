import type { AgentFamily, MechClass } from '../../shared/types'
import atlas from '../../../assets/mechs/atlas-poc.png?url'
import marauder from '../../../assets/mechs/marauder-poc.png?url'
import raven from '../../../assets/mechs/raven-poc.png?url'
import catapult from '../../../assets/mechs/catapult-poc.png?url'
import locust from '../../../assets/mechs/locust-poc.png?url'

export const CREW: Record<MechClass, { image: string; role: string; code: string }> = {
  atlas: { image: atlas, role: 'Heavy assault', code: 'ATL' },
  marauder: { image: marauder, role: 'Precision strike', code: 'MAR' },
  raven: { image: raven, role: 'Reconnaissance', code: 'RVN' },
  catapult: { image: catapult, role: 'Visual analysis', code: 'CPL' },
  locust: { image: locust, role: 'Fast courier', code: 'LCT' }
}

export const RUNTIME_NAMES: Record<AgentFamily, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  kimi: 'Kimi',
  gemini: 'Gemini',
  hermes: 'Custom CLI'
}
