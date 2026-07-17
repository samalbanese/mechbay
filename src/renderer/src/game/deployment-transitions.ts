import type { Deployment } from '../../../shared/types'

export type DeploymentAction =
  | { kind: 'walk-to-facility'; companionId: string; facilityId: string; deploymentId: string }
  | { kind: 'start-working'; companionId: string; facilityId: string }
  | { kind: 'stop-working'; companionId: string; facilityId: string }
  | { kind: 'dead-in-field'; companionId: string }
  | { kind: 'completion-bubble'; companionId: string; deploymentId: string }
  | { kind: 'walk-home'; companionId: string }

export function computeDeploymentActions(
  prevDeployments: Deployment[],
  nextDeployments: Deployment[]
): DeploymentAction[] {
  const previousStatuses = new Map(
    prevDeployments.map((deployment) => [deployment.id, deployment.status])
  )
  const actions: DeploymentAction[] = []

  for (const deployment of nextDeployments) {
    const prevStatus = previousStatuses.get(deployment.id)
    if (deployment.status === 'walking-to' && prevStatus !== 'walking-to') {
      actions.push({
        kind: 'walk-to-facility',
        companionId: deployment.companionId,
        facilityId: deployment.facilityId,
        deploymentId: deployment.id
      })
    }
    if (deployment.status === 'failed' && prevStatus !== 'failed') {
      actions.push({ kind: 'dead-in-field', companionId: deployment.companionId })
    }
    if (deployment.status === 'working' && prevStatus !== 'working') {
      actions.push({
        kind: 'start-working',
        companionId: deployment.companionId,
        facilityId: deployment.facilityId
      })
    }
    if (deployment.status !== 'working' && prevStatus === 'working') {
      actions.push({
        kind: 'stop-working',
        companionId: deployment.companionId,
        facilityId: deployment.facilityId
      })
    }
    if (deployment.status === 'completed' && prevStatus === 'working') {
      actions.push({
        kind: 'completion-bubble',
        companionId: deployment.companionId,
        deploymentId: deployment.id
      })
    }
    if (
      (deployment.status === 'completed' || deployment.status === 'cancelled') &&
      prevStatus !== 'completed' &&
      prevStatus !== 'cancelled'
    ) {
      actions.push({ kind: 'walk-home', companionId: deployment.companionId })
    }
  }

  return actions
}
