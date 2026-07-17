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
  /**
   * Runtime override — which agent family this companion actually
   * deploys with. Undefined means "use `family`". Optional so old
   * persisted state (pre-runtime-reassignment) stays valid without a
   * schema bump.
   */
  runtime?: AgentFamily
  /** Optional model override passed through to the runtime CLI. */
  model?: string
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

export interface DiffFileStat {
  path: string
  insertions: number
  deletions: number
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
  diffFiles?: DiffFileStat[]
  baselineSha?: string
  pendingInput?: { prompt: string; detectedAt: number }
}

export interface LogChunk {
  id: string
  deploymentId: string
  timestamp: number
  stream: 'stdout' | 'stderr' | 'system' | 'thought'
  text: string
  /**
   * Set iff `stream === 'thought'`. Lets the renderer distinguish
   * forward-looking intent cards from backward-looking findings cards
   * without re-parsing the text prefix. Optional so persisted LogChunks
   * from older sessions don't need migration — non-thought streams
   * simply omit it.
   */
  thoughtKind?: 'intent' | 'findings'
}

/**
 * Bump this literal when the seed shape changes incompatibly. The
 * StateManager migration wipes any cached state whose version doesn't
 * match (TODO(Wave 5): preserve user-facing settings + deployments
 * history across bumps once those become editable / valuable).
 */
export type StateSchemaVersion = 2

/** Payload for SOUL_READ IPC call. */
export interface SoulReadPayload {
  companionId: string
}

/** Result for SOUL_READ IPC call. */
export type SoulReadResult = { ok: true; content: string } | { ok: false; error: string }

/** Payload for SOUL_WRITE IPC call. */
export interface SoulWritePayload {
  companionId: string
  content: string
}

/** Result for SOUL_WRITE IPC call. */
export type SoulWriteResult = { ok: true } | { ok: false; error: string }

/** Payload for MEMORY_READ IPC call. */
export interface MemoryReadPayload {
  companionId: string
}

/** Result for MEMORY_READ IPC call. */
export type MemoryReadResult = { ok: true; content: string } | { ok: false; error: string }

/** Payload for BULK_IMPORT_RUN IPC call. */
export interface BulkImportRunPayload {
  selectedPaths: string[]
}

/** A directory discovered by the project scanner. */
export interface DiscoveredProject {
  /** Directory name (basename, not the full path). */
  name: string
  /** Absolute path on disk. */
  path: string
  /** Which marker files/dirs triggered the match. */
  markers: string[]
}

/** Result for BULK_IMPORT_RUN IPC call. */
export type BulkImportRunResult =
  | { ok: true; imported: number; facilities: Facility[] }
  | { ok: false; error: string }

/** Payload for COMPANION_CONFIGURE IPC call. */
export interface CompanionConfigurePayload {
  companionId: string
  runtime: AgentFamily
  model?: string
}

/** Result for COMPANION_CONFIGURE IPC call. */
export type CompanionConfigureResult =
  | { ok: true; cliAvailable: boolean }
  | { ok: false; error: string }

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
