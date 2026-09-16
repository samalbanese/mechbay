import type { AppState, Companion, Deployment, DeploymentStatus } from '../../shared/types'

export const STATUS_LABELS: Record<DeploymentStatus, string> = {
  queued: 'Queued',
  'walking-to': 'En route',
  working: 'Working',
  'awaiting-input': 'Needs input',
  returning: 'Returning',
  completed: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

export function isActiveMission(deployment: Deployment): boolean {
  return ['walking-to', 'working', 'awaiting-input', 'returning'].includes(deployment.status)
}

export function currentMission(
  companionId: string,
  deployments: Deployment[]
): Deployment | undefined {
  return deployments.find(
    (d) => d.companionId === companionId && (isActiveMission(d) || d.status === 'queued')
  )
}

export function canDispatch(companion: Companion, deployments: Deployment[]): boolean {
  return companion.cliAvailable && !currentMission(companion.id, deployments)
}

export function fleetTelemetry(state: AppState): {
  ready: number
  active: number
  queued: number
  completed: number
  linked: number
} {
  return {
    ready: state.companions.filter((c) => canDispatch(c, state.deployments)).length,
    active: state.deployments.filter(isActiveMission).length,
    queued: state.deployments.filter((d) => d.status === 'queued').length,
    completed: state.deployments.filter((d) => d.status === 'completed').length,
    linked: state.facilities.filter((f) => Boolean(f.path)).length
  }
}

export function missionDuration(deployment: Deployment, now: number): string {
  const seconds = Math.max(
    0,
    Math.floor(((deployment.completedAt ?? now) - deployment.startedAt) / 1000)
  )
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
