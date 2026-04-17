import fs from 'fs'
import path from 'path'
import type { MechClass } from '../shared/types'
import { defaultSoul, defaultMemory } from '../shared/defaults'

export interface SoulMemoryPaths {
  soulPath: string
  memoryPath: string
}

/**
 * Idempotent: creates soul.md + memory.md from templates if they don't
 * exist, but never overwrites a file the user has already edited. Called
 * on boot for every companion so the files are guaranteed to exist before
 * any deploy tries to read them.
 */
export function scaffoldSoulAndMemory(
  mechClass: MechClass,
  name: string,
  paths: SoulMemoryPaths
): void {
  fs.mkdirSync(path.dirname(paths.soulPath), { recursive: true })
  fs.mkdirSync(path.dirname(paths.memoryPath), { recursive: true })
  if (!fs.existsSync(paths.soulPath)) fs.writeFileSync(paths.soulPath, defaultSoul(mechClass))
  if (!fs.existsSync(paths.memoryPath)) fs.writeFileSync(paths.memoryPath, defaultMemory(name))
}

export function assembleSystemPrompt(
  name: string,
  paths: SoulMemoryPaths,
  taskPrompt: string
): string {
  if (!fs.existsSync(paths.soulPath) || !fs.existsSync(paths.memoryPath)) {
    throw new Error(
      `soul/memory missing for ${name} — call scaffoldSoulAndMemory first (soulPath=${paths.soulPath})`
    )
  }
  const soul = fs.readFileSync(paths.soulPath, 'utf-8')
  const memory = fs.readFileSync(paths.memoryPath, 'utf-8')
  return `# ${name} — Soul\n\n${soul}\n\n# ${name} — Memory\n\n${memory}\n\n---\n\n# Current Task\n\n${taskPrompt}\n`
}

export interface MemoryEntry {
  timestamp: Date
  facility: string
  task: string
  outcome: string
}

export function appendMemoryEntry(memoryPath: string, entry: MemoryEntry): void {
  const ts = entry.timestamp.toISOString().replace('T', ' ').slice(0, 16)
  const block = `\n## ${ts} — ${entry.facility} · "${entry.task}"\n${entry.outcome}\n`
  fs.appendFileSync(memoryPath, block)
}
