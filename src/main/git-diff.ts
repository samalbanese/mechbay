import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DiffFileStat } from '../shared/types'

export type { DiffFileStat } from '../shared/types'

export interface DiffSummary {
  filesChanged: number
  insertions: number
  deletions: number
  files: DiffFileStat[]
}

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 5000
const GIT_MAX_BUFFER = 10 * 1024 * 1024
const FILE_LIST_LIMIT = 50

async function runGit(
  repoPath: string,
  args: string[],
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true,
      signal
    })
    return stdout
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err)
    console.error(`[git-diff] git ${args.join(' ')} failed: ${message}`)
    return null
  }
}

function parseNumstat(output: string): DiffFileStat[] {
  const files: DiffFileStat[] = []

  for (const row of output.split(/\r?\n/)) {
    if (!row) continue
    const [insertions, deletions, ...pathParts] = row.split('\t')
    const filePath = pathParts.join('\t')
    if (!filePath) continue
    files.push({
      path: filePath,
      insertions: insertions === '-' ? 0 : Number.parseInt(insertions, 10) || 0,
      deletions: deletions === '-' ? 0 : Number.parseInt(deletions, 10) || 0
    })
  }

  return files
}

function parseStatus(output: string, untrackedOnly: boolean): DiffFileStat[] {
  const files: DiffFileStat[] = []

  for (const row of output.split(/\r?\n/)) {
    if (row.length < 4 || (untrackedOnly && !row.startsWith('??'))) continue
    files.push({ path: row.slice(3), insertions: 0, deletions: 0 })
  }

  return files
}

function summarize(files: DiffFileStat[]): DiffSummary {
  return {
    filesChanged: files.length,
    insertions: files.reduce((total, file) => total + file.insertions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    files: files.slice(0, FILE_LIST_LIMIT)
  }
}

export async function captureGitBaseline(repoPath: string): Promise<string | null> {
  const stdout = await runGit(repoPath, ['rev-parse', 'HEAD'])
  const sha = stdout?.trim()
  return sha || null
}

export async function computeDiffSummary(
  repoPath: string,
  baselineSha: string | null
): Promise<DiffSummary | null> {
  const abortController = new AbortController()
  const deadline = setTimeout(() => abortController.abort(), GIT_TIMEOUT_MS)

  try {
    if (baselineSha) {
      const numstat = await runGit(
        repoPath,
        ['diff', '--numstat', baselineSha],
        abortController.signal
      )
      if (numstat === null) return null

      const status = await runGit(repoPath, ['status', '--porcelain'], abortController.signal)
      if (status === null) return null

      const files = parseNumstat(numstat)
      const existingPaths = new Set(files.map((file) => file.path))
      for (const untracked of parseStatus(status, true)) {
        if (!existingPaths.has(untracked.path)) files.push(untracked)
      }
      return summarize(files)
    }

    const isGitRepo = await runGit(
      repoPath,
      ['rev-parse', '--is-inside-work-tree'],
      abortController.signal
    )
    if (isGitRepo?.trim() !== 'true') return null

    const status = await runGit(repoPath, ['status', '--porcelain'], abortController.signal)
    if (status === null) return null
    return summarize(parseStatus(status, false))
  } catch (err) {
    console.error('[git-diff] unable to compute diff summary:', err)
    return null
  } finally {
    clearTimeout(deadline)
  }
}
