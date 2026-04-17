import fs from 'fs/promises'
import path from 'path'

/**
 * A directory we found under the user's projects root that carries at
 * least one recognized project marker. The renderer uses this to
 * suggest facility bindings or populate a project picker.
 */
export interface DiscoveredProject {
  /** Directory name (basename, not the full path). */
  name: string
  /** Absolute path on disk. */
  path: string
  /** Which marker files/dirs triggered the match. */
  markers: string[]
}

/**
 * Project markers — presence of ANY of these inside an immediate
 * subdirectory means "this is a project worth listing."
 */
const MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json'
]

/**
 * Shallowly scan `rootDir` for child directories that look like
 * projects. Purely a read operation — does not mutate state. Ignores:
 *   - non-directory entries
 *   - directories listed in `ignore`
 *   - directories whose name begins with '.' (dotfiles like `.cache`)
 *   - directories that error when read (permission denied etc.)
 *
 * Not recursive — we only want the user's top-level project layout,
 * not every package folder inside node_modules.
 */
export async function scanProjects(
  rootDir: string,
  ignore: string[] = []
): Promise<DiscoveredProject[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true })
  } catch {
    return []
  }

  const results: DiscoveredProject[] = []
  const ignoreSet = new Set(ignore)

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (ignoreSet.has(entry.name)) continue

    const fullPath = path.join(rootDir, entry.name)
    let children: string[]
    try {
      children = await fs.readdir(fullPath)
    } catch {
      continue
    }
    const childSet = new Set(children)
    const found = MARKERS.filter((m) => childSet.has(m))
    if (found.length > 0) {
      results.push({ name: entry.name, path: fullPath, markers: found })
    }
  }

  // Stable alphabetical order so the UI doesn't reorder on every scan.
  results.sort((a, b) => a.name.localeCompare(b.name))
  return results
}
