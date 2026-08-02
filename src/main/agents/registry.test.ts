import { describe, expect, it, vi } from 'vitest'
import type { CodingAgentAdapter } from './adapter'
import { AgentRegistry } from './registry'

function adapter(id: string): CodingAgentAdapter {
  return {
    descriptor: {
      id,
      label: id,
      description: '',
      capabilities: {
        resume: false,
        sessionIdentity: false,
        activityEvents: false,
        transcript: false
      },
      settings: { version: 1, fields: [], actions: [] },
      setupSteps: []
    },
    probe: vi.fn(async () => ({
      status: 'available' as const,
      executable: id,
      version: '1.0.0',
      message: null
    })),
    buildLaunch: vi.fn(() => ({ executable: id, args: [], env: {} })),
    buildResume: vi.fn(() => null),
    validateSessionRef: vi.fn(() => null)
  }
}

describe('AgentRegistry', () => {
  it('registers stable adapter ids and exposes provider-neutral descriptors', async () => {
    const openCode = adapter('opencode')
    const registry = new AgentRegistry([openCode])
    expect(registry.get('opencode')).toBe(openCode)
    expect(registry.descriptors()).toEqual([openCode.descriptor])
    await expect(registry.probe('opencode')).resolves.toMatchObject({
      status: 'available'
    })
  })

  it('rejects invalid or duplicate ids and keeps unknown historical ids non-runnable', () => {
    expect(() => new AgentRegistry([adapter('Bad Agent')])).toThrow(
      'Invalid Coding Agent id'
    )
    expect(() => new AgentRegistry([adapter('same'), adapter('same')])).toThrow(
      'already registered'
    )
    const registry = new AgentRegistry()
    expect(registry.get('removed-agent')).toBeNull()
    expect(() => registry.require('removed-agent')).toThrow('not installed')
  })
})
