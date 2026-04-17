/**
 * Shared type definitions for MechBay.
 *
 * These types are imported by Main, Preload, and Renderer. Keep them
 * serializable (no class instances, no functions, no Maps/Sets) so they
 * cross IPC boundaries cleanly.
 */

export type AgentFamily = 'claude' | 'codex' | 'kimi' | 'gemini' | 'hermes'

export type MechClass = 'atlas' | 'marauder' | 'raven' | 'catapult' | 'locust'

export type FacilityType =
  | 'security-bay'
  | 'research-lab'
  | 'foundry'
  | 'command-center'
  | 'salvage-dock'
  | 'data-archive'

/** Filesystem tree node returned by FS_READ_DIR — consumed by FileBrowser. */
export interface FsNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

export type DeploymentStatus =
  | 'queued'
  | 'walking-to'
  | 'working'
  | 'awaiting-input'
  | 'returning'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface Companion {
  id: string
  family: AgentFamily
  mechClass: MechClass
  name: string
  spriteKey: string
  homeTile: { x: number; y: number }
  cliAvailable: boolean
  recentDeploymentIds: string[]
  soulPath: string
  memoryPath: string
  lastMemoryUpdateAt?: number
}

export interface Facility {
  id: string
  name: string
  path: string
  facilityType: FacilityType
  tile: { x: number; y: number }
  source: 'auto-scan' | 'manual'
  discoveredAt: number
  decommissioned?: boolean
}

export interface Deployment {
  id: string
  companionId: string
  facilityId: string
  taskPrompt: string
  quickPromptUsed?: string
  status: DeploymentStatus
  startedAt: number
  completedAt?: number
  exitCode?: number
  summary?: string
  diffStats?: { filesChanged: number; insertions: number; deletions: number }
  pendingInput?: { prompt: string; detectedAt: number }
}

export interface LogChunk {
  id: string
  deploymentId: string
  timestamp: number
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

/**
 * Bump this literal when the seed shape changes incompatibly. The
 * StateManager migration wipes any cached state whose version doesn't
 * match (TODO(Wave 5): preserve user-facing settings + deployments
 * history across bumps once those become editable / valuable).
 */
export type StateSchemaVersion = 2

export interface AppState {
  version: StateSchemaVersion
  companions: Companion[]
  facilities: Facility[]
  deployments: Deployment[]
  logChunks: LogChunk[]
  settings: {
    projectsDir: string
    concurrencyCap: number
    ignoredMarkers: string[]
    companionNameOverrides: Record<string, string>
  }
  lastScanAt?: number
}
