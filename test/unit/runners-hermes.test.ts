import { describe, it, expect } from 'vitest'
import { HermesRunner } from '../../src/main/runners/hermes'

describe('HermesRunner (stub)', () => {
  it('reports not available until integration lands', async () => {
    expect(await new HermesRunner().isAvailable()).toBe(false)
  })

  it('throws a clear error on spawn()', async () => {
    const runner = new HermesRunner()
    await expect(runner.spawn('/tmp', 'noop')).rejects.toThrow(/integration TBD/)
  })
})
