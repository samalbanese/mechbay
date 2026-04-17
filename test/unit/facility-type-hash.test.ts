import { describe, it, expect } from 'vitest'
import { facilityTypeFromName } from '../../src/main/facility-type-hash'

describe('facilityTypeFromName', () => {
  it('is deterministic for the same input', () => {
    expect(facilityTypeFromName('dice-oracle')).toBe(facilityTypeFromName('dice-oracle'))
    expect(facilityTypeFromName('mechbay')).toBe(facilityTypeFromName('mechbay'))
  })

  it('returns one of the 6 valid facility types', () => {
    const valid = [
      'security-bay',
      'research-lab',
      'foundry',
      'command-center',
      'salvage-dock',
      'data-archive'
    ]
    for (const name of ['a', 'project-x', 'dice-oracle', 'mechbay', 'hermes', 'sentinel', '']) {
      expect(valid).toContain(facilityTypeFromName(name))
    }
  })

  it('spreads different names across the 6 types (at least 3 distinct outputs in 20 names)', () => {
    const names = Array.from({ length: 20 }, (_, i) => `project-${i}`)
    const types = new Set(names.map(facilityTypeFromName))
    expect(types.size).toBeGreaterThanOrEqual(3)
  })
})
