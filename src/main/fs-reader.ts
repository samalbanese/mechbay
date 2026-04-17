import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

export interface FsNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

export interface ReadDirOptions {
  ignore?: string[]
}

/**
 * Path-whitelist-guarded filesystem reader. Resolves real paths via
 * `realpathSync.native` before checking containment, so symlink escapes
 * and `..` traversal both resolve to the canonical target and get
 * compared against the realpath of each whitelisted root.
 *
 * Fails closed: if realpath can't be resolved (e.g., target doesn't exist,
 * permission error), `isAllowed` returns false and the caller gets
 * "Access denied" instead of leaking the underlying fs error.
 */
export class FsReader {
  private whitelist: string[]

  constructor(whitelist: string[]) {
    this.whitelist = [...whitelist]
  }

  updateWhitelist(paths: string[]): void {
    this.whitelist = [...paths]
  }

  private realpathSafe(p: string): string | null {
    try {
      return fsSync.realpathSync.native(path.resolve(p))
    } catch {
      return null
    }
  }

  private isAllowed(target: string): boolean {
    const resolved = this.realpathSafe(target)
    if (resolved === null) return false
    return this.whitelist.some((w) => {
      const whitelisted = this.realpathSafe(w)
      if (whitelisted === null) return false
      return resolved === whitelisted || resolved.startsWith(whitelisted + path.sep)
    })
  }

  async readDir(dirPath: string, options: ReadDirOptions = {}): Promise<FsNode[]> {
    if (!this.isAllowed(dirPath)) throw new Error(`Access denied: ${dirPath}`)
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const ignore = options.ignore ?? []
    const results: FsNode[] = []
    for (const e of entries) {
      if (ignore.includes(e.name)) continue
      const fullPath = path.join(dirPath, e.name)
      const stat = await fs.stat(fullPath).catch(() => null)
      results.push({
        name: e.name,
        path: fullPath,
        type: e.isDirectory() ? 'directory' : 'file',
        size: stat?.isFile() ? stat.size : undefined
      })
    }
    return results
  }

  async readFile(filePath: string, maxBytes: number = 1_048_576): Promise<string> {
    if (!this.isAllowed(filePath)) throw new Error(`Access denied: ${filePath}`)
    const stat = await fs.stat(filePath)
    if (stat.size > maxBytes) {
      throw new Error(`File too large: ${stat.size} bytes (max ${maxBytes})`)
    }
    return fs.readFile(filePath, 'utf-8')
  }
}
