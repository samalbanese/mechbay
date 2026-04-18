import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { FsReader } from '../../src/main/fs-reader'

describe('FsReader — symlink escape prevention', () => {
  const root = path.join(os.tmpdir(), 'mechbay-symlink-test-' + Date.now())
  const allowedDir = path.join(root, 'allowed')
  const secretDir = path.join(root, 'secret')

  beforeEach(() => {
    fs.mkdirSync(allowedDir, { recursive: true })
    fs.mkdirSync(secretDir, { recursive: true })
    fs.writeFileSync(path.join(secretDir, 'secret.txt'), 'top-secret')
  })

  afterEach(() => {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('rejects symlink pointing outside whitelist (absolute symlink)', async () => {
    // Create a symlink inside allowed that points to secretDir
    const symlinkPath = path.join(allowedDir, 'escape')
    fs.symlinkSync(secretDir, symlinkPath, 'junction')

    const reader = new FsReader([allowedDir])
    // The symlink target resolves to secretDir which is outside allowedDir
    await expect(reader.readDir(symlinkPath)).rejects.toThrow(/access denied/i)
  })

  it('rejects file read via symlink pointing outside whitelist', async () => {
    const secretFile = path.join(secretDir, 'secret.txt')
    const symlinkPath = path.join(allowedDir, 'leak.txt')
    fs.symlinkSync(secretFile, symlinkPath, 'file')

    const reader = new FsReader([allowedDir])
    await expect(reader.readFile(symlinkPath)).rejects.toThrow(/access denied/i)
  })

  it('allows symlink that stays within whitelist (relative symlink)', async () => {
    const subDir = path.join(allowedDir, 'subdir')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'nested content')

    // Create relative symlink: allowed/link -> allowed/subdir
    const symlinkPath = path.join(allowedDir, 'link')
    fs.symlinkSync('./subdir', symlinkPath, 'dir')

    const reader = new FsReader([allowedDir])
    // Should succeed - resolved path is still within allowedDir
    const entries = await reader.readDir(symlinkPath)
    expect(entries.map((e) => e.name)).toContain('nested.txt')
  })

  it('rejects deeply nested symlink escape (chained symlinks)', async () => {
    const nestedDir = path.join(allowedDir, 'deep', 'nesting')
    fs.mkdirSync(nestedDir, { recursive: true })

    // Create chain: allowed/deep/nesting/escape -> secretDir
    const symlinkPath = path.join(nestedDir, 'escape')
    fs.symlinkSync(secretDir, symlinkPath, 'junction')

    const reader = new FsReader([allowedDir])
    await expect(reader.readDir(symlinkPath)).rejects.toThrow(/access denied/i)
  })

  it('allows access when whitelist entry is a symlink (resolves to target)', async () => {
    // Whitelist contains a path that is actually a symlink to secretDir
    const whitelistedSymlink = path.join(root, 'whitelisted-link')
    fs.symlinkSync(secretDir, whitelistedSymlink, 'junction')

    const reader = new FsReader([whitelistedSymlink])
    // The whitelist entry resolves to secretDir, so reading the symlink
    // path is allowed because it resolves to the whitelisted path
    const entries = await reader.readDir(whitelistedSymlink)
    expect(entries.map((e) => e.name)).toContain('secret.txt')
  })
})

describe('FsReader — whitelist edge cases', () => {
  const root = path.join(os.tmpdir(), 'mechbay-whitelist-edge-' + Date.now())

  afterEach(() => {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('rejects access when whitelist entry does not exist', async () => {
    const nonExistent = path.join(root, 'does-not-exist')
    const targetDir = path.join(root, 'target')
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, 'file.txt'), 'content')

    const reader = new FsReader([nonExistent])
    // Non-existent whitelist entry can't realpath, so isAllowed returns false
    await expect(reader.readDir(targetDir)).rejects.toThrow(/access denied/i)
  })

  it('rejects access when target realpath fails (broken symlink)', async () => {
    const allowedDir = path.join(root, 'allowed')
    fs.mkdirSync(allowedDir, { recursive: true })

    // Create a broken symlink as the target path
    const brokenSymlink = path.join(root, 'broken-link')
    fs.symlinkSync(path.join(root, 'non-existent-target'), brokenSymlink, 'file')

    const reader = new FsReader([allowedDir])
    // realpathSafe on broken symlink returns null, so isAllowed returns false
    await expect(reader.readFile(brokenSymlink)).rejects.toThrow(/access denied/i)
  })

  it('handles empty whitelist (no access granted)', async () => {
    const targetDir = path.join(root, 'target')
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, 'file.txt'), 'content')

    const reader = new FsReader([])
    await expect(reader.readDir(targetDir)).rejects.toThrow(/access denied/i)
    await expect(reader.readFile(path.join(targetDir, 'file.txt'))).rejects.toThrow(
      /access denied/i
    )
  })
})
