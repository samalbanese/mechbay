import type { FacilityType } from '../shared/types'

/**
 * Deterministic assignment of a FacilityType archetype to a facility name.
 * The hash picks one of the 6 seeded archetypes so the sprite + label stay
 * stable across restarts for the same folder, but different folders spread
 * across the 6 types visually. It has no semantic meaning — "Research Lab"
 * for your API project is purely decorative, not a capability marker.
 */
const FACILITY_TYPES: readonly FacilityType[] = [
  'security-bay',
  'research-lab',
  'foundry',
  'command-center',
  'salvage-dock',
  'data-archive'
] as const

export function facilityTypeFromName(name: string): FacilityType {
  // djb2 hash — fast, deterministic, and gives better distribution across
  // 6 buckets than sum-of-char-codes for short project names.
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % FACILITY_TYPES.length
  return FACILITY_TYPES[idx]
}
