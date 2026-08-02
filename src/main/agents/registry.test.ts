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

function mutateDescriptor(
  mutate: (descriptor: CodingAgentAdapter['descriptor']) => void
): CodingAgentAdapter {
  const value = adapter('contract-test')
  mutate(value.descriptor)
  return value
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

  it('rejects descriptor versions, capabilities and action schemas that generic UI cannot honor', () => {
    expect(
      () =>
        new AgentRegistry([
          mutateDescriptor((descriptor) => {
            ;(descriptor.settings as { version: number }).version = 0
          })
        ])
    ).toThrow('settings version')
    expect(
      () =>
        new AgentRegistry([
          mutateDescriptor((descriptor) => {
            ;(descriptor.capabilities as Record<string, unknown>)['resume'] = 'yes'
          })
        ])
    ).toThrow('capability')
    expect(
      () =>
        new AgentRegistry([
          mutateDescriptor((descriptor) => {
            ;(descriptor.settings as unknown as { actions: unknown[] }).actions = [
              { id: 'run', label: 'Run', kind: 'arbitrary-command' }
            ]
          })
        ])
    ).toThrow('settings action')
  })

  it('rejects duplicate schema ids, missing login implementations and dangling setup actions', () => {
    expect(
      () =>
        new AgentRegistry([
          mutateDescriptor((descriptor) => {
            ;(descriptor.settings as unknown as { fields: unknown[] }).fields = [
              { key: 'path', label: 'Path', kind: 'path', required: false },
              { key: 'path', label: 'Other path', kind: 'path', required: false }
            ]
          })
        ])
    ).toThrow('duplicate settings field')
    expect(
      () =>
        new AgentRegistry([
          mutateDescriptor((descriptor) => {
            ;(descriptor.settings as unknown as { actions: unknown[] }).actions = [
              { id: 'login', label: 'Login', kind: 'open-login' }
            ]
          })
        ])
    ).toThrow('no implementation')
    expect(
      () =>
        new AgentRegistry([
          mutateDescriptor((descriptor) => {
            ;(descriptor.setupSteps as unknown[]) = [
              {
                id: 'setup',
                title: 'Setup',
                description: 'Run setup',
                actionId: 'missing'
              }
            ]
          })
        ])
    ).toThrow('unknown action')
  })
})
