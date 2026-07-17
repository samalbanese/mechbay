import { afterEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { captureGitBaseline, computeDiffSummary } from '../../src/main/git-diff'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

async function runGit(repoPath: string, args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', repoPath, ...args], { windowsHide: true })
}

async function makeRepo(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), 'mechbay-git-diff-'))
  tempDirs.push(repoPath)
  await runGit(repoPath, ['init'])
  await runGit(repoPath, ['config', 'user.email', 'test@mechbay.local'])
  await runGit(repoPath, ['config', 'user.name', 'MechBay Test'])
  await writeFile(path.join(repoPath, 'tracked.txt'), 'line one\nline two\n')
  await runGit(repoPath, ['add', 'tracked.txt'])
  await runGit(repoPath, ['commit', '-m', 'initial'])
  return repoPath
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('git diff capture', () => {
  it('captures a baseline and summarizes tracked plus untracked changes', async () => {
    const repoPath = await makeRepo()
    const baselineSha = await captureGitBaseline(repoPath)

    await writeFile(path.join(repoPath, 'tracked.txt'), 'line one\nupdated line\nadded line\n')
    await writeFile(path.join(repoPath, 'untracked.txt'), 'not yet added\n')

    const diff = await computeDiffSummary(repoPath, baselineSha)

    expect(baselineSha).toMatch(/^[0-9a-f]{40}$/)
    expect(diff).not.toBeNull()
    expect(diff).toMatchObject({ filesChanged: 2, insertions: 2, deletions: 1 })
    expect(diff?.files).toEqual(
      expect.arrayContaining([
        { path: 'tracked.txt', insertions: 2, deletions: 1 },
        { path: 'untracked.txt', insertions: 0, deletions: 0 }
      ])
    )
  })

  it('returns null for a directory that is not a git repository', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mechbay-not-git-'))
    tempDirs.push(directory)
    await mkdir(path.join(directory, 'nested'))

    await expect(captureGitBaseline(directory)).resolves.toBeNull()
    await expect(computeDiffSummary(directory, null)).resolves.toBeNull()
  })

  it('falls back to porcelain file counts for a repository without commits', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'mechbay-unborn-repo-'))
    tempDirs.push(repoPath)
    await runGit(repoPath, ['init'])
    await writeFile(path.join(repoPath, 'pending.txt'), 'waiting for first commit\n')

    await expect(captureGitBaseline(repoPath)).resolves.toBeNull()
    await expect(computeDiffSummary(repoPath, null)).resolves.toEqual({
      filesChanged: 1,
      insertions: 0,
      deletions: 0,
      files: [{ path: 'pending.txt', insertions: 0, deletions: 0 }]
    })
  })

  it('counts binary numstat rows as changed files with zero line totals', async () => {
    const repoPath = await makeRepo()
    const baselineSha = await captureGitBaseline(repoPath)

    await writeFile(path.join(repoPath, 'asset.bin'), Buffer.from([0, 1, 2, 3, 4]))
    await runGit(repoPath, ['add', 'asset.bin'])
    await runGit(repoPath, ['commit', '-m', 'add binary asset'])

    const diff = await computeDiffSummary(repoPath, baselineSha)

    expect(diff).not.toBeNull()
    expect(diff).toMatchObject({ filesChanged: 1, insertions: 0, deletions: 0 })
    expect(diff?.files).toContainEqual({ path: 'asset.bin', insertions: 0, deletions: 0 })
  })
})
