/**
 * IPC channel name constants. Naming scheme: `mechbay:${domain}:${action}`.
 * Grep-friendly across the entire codebase.
 */
export const IPC = {
  STATE_SUBSCRIBE: 'mechbay:state:subscribe',
  STATE_GET: 'mechbay:state:get',
  DEPLOY_START: 'mechbay:deploy:start',
  DEPLOY_ABORT: 'mechbay:deploy:abort',
  DEPLOY_INPUT: 'mechbay:deploy:input',
  LOG_STREAM: 'mechbay:log:stream',
  FS_READ_DIR: 'mechbay:fs:readDir',
  FS_READ_FILE: 'mechbay:fs:readFile',
  SCAN_PROJECTS: 'mechbay:scan:projects',
  CLI_RESCAN: 'mechbay:cli:rescan'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
