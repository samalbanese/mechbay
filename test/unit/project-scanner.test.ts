import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { scanProjects } from '../../src/main/project-scanner'

let tmpRoot: string

async function makeDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function touch(p: string, content = ''): Promise<void> {
  await fs.writeFile(p, content)
}

describe('scanProjects', () => {
  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mechbay-scan-'))
    // Project-looking dirs
    await makeDir(path.join(tmpRoot, 'mechbay'))
    await touch(path.join(tmpRoot, 'mechbay', 'package.json'), '{}')
    await makeDir(path.join(tmpRoot, 'mechbay', '.git'))

    await makeDir(path.join(tmpRoot, 'pyservice'))
    await touch(path.join(tmpRoot, 'pyservice', 'pyproject.toml'), '')

    await makeDir(path.join(tmpRoot, 'crawler'))
    await makeDir(path.join(tmpRoot, 'crawler', '.git'))

    // Should be ignored: no markers
    await makeDir(path.join(tmpRoot, 'scratch'))
    await touch(path.join(tmpRoot, 'scratch', 'notes.txt'))

    // Should be ignored: dotfile dir
    await makeDir(path.join(tmpRoot, '.cache'))
    await touch(path.join(tmpRoot, '.cache', 'package.json'), '{}')

    // Should be ignored: in ignore list
    await makeDir(path.join(tmpRoot, 'Archived'))
    await touch(path.join(tmpRoot, 'Archived', 'package.json'), '{}')

    // Should be ignored: not a directory
    await touch(path.join(tmpRoot, 'README.md'))
  })

  afterAll(async () => {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('finds directories with project markers', async () => {
    const found = await scanProjects(tmpRoot, ['Archived'])
    const byName = Object.fromEntries(found.map((p) => [p.name, p]))

    expect(byName.mechbay).toBeDefined()
    expect(byName.mechbay.markers.sort()).toEqual(['.git', 'package.json'])

    expect(byName.pyservice).toBeDefined()
    expect(byName.pyservice.markers).toEqual(['pyproject.toml'])

    expect(byName.crawler).toBeDefined()
    expect(byName.crawler.markers).toEqual(['.git'])
  })

  it('excludes entries in the ignore list', async () => {
    const found = await scanProjects(tmpRoot, ['Archived'])
    expect(found.find((p) => p.name === 'Archived')).toBeUndefined()
  })

  it('excludes dotfile directories + non-project dirs', async () => {
    const found = await scanProjects(tmpRoot, [])
    expect(found.find((p) => p.name === '.cache')).toBeUndefined()
    expect(found.find((p) => p.name === 'scratch')).toBeUndefined()
  })

  it('returns empty list for a non-existent root (no throw)', async () => {
    const found = await scanProjects(path.join(tmpRoot, 'does-not-exist'))
    expect(found).toEqual([])
  })

  it('returns alphabetically sorted results', async () => {
    const found = await scanProjects(tmpRoot, ['Archived'])
    const names = found.map((p) => p.name)
    expect(names).toEqual([...names].sort())
  })
})
