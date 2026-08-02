import { describe, expect, it } from 'vitest'
import type { AgentSessionRef } from '@shared/agent'
import type { CodingAgentAdapter, ManagedAgentIntegration } from './adapter'
import { encodePowerShellInvocation, validateAgentLaunchSpec } from './agent-launch'
import { ChrysAdapter } from './chrys-adapter'
import { E2ETestAgentAdapter } from './e2e-test-adapter'
import { OpenCodeAdapter } from './opencode-adapter'
import { AgentRegistry } from './registry'

const integration: ManagedAgentIntegration = {
  diagnose: () => ({ state: 'current', path: 'managed', message: 'ready' }),
  ensureInstalled: () => ({ state: 'current', path: 'managed', message: 'ready' }),
  uninstall: () => ({ state: 'missing', path: 'managed', message: 'removed' })
}

interface AdapterCase {
  adapter: CodingAgentAdapter
  validRef: AgentSessionRef | null
  expectedResumeArgs: readonly string[] | null
}

function cases(): AdapterCase[] {
  return [
    {
      adapter: new OpenCodeAdapter(
        { snapshot: () => new Set(), findCreatedSession: () => null },
        integration
      ),
      validRef: { kind: 'session-id', value: 'ses_contract_123' },
      expectedResumeArgs: ['--session', 'ses_contract_123']
    },
    {
      adapter: new ChrysAdapter(integration),
      validRef: {
        kind: 'chrys-session-id',
        value: '123e4567-e89b-12d3-a456-426614174000'
      },
      expectedResumeArgs: ['-s', '123e4567-e89b-12d3-a456-426614174000']
    },
    {
      adapter: new E2ETestAgentAdapter(),
      validRef: null,
      expectedResumeArgs: null
    }
  ]
}

describe('Coding Agent adapter contract', () => {
  it('registers every shipped adapter with a generic-UI-compatible descriptor', () => {
    const adapters = cases().map(({ adapter }) => adapter)
    expect(() => new AgentRegistry(adapters)).not.toThrow()
    expect(new AgentRegistry(adapters).descriptors().map(({ id }) => id)).toEqual([
      'opencode',
      'chrys',
      'test-agent'
    ])
  })

  it.each(cases())(
    '$adapter.descriptor.id returns structured, safely encodable launch argv',
    ({ adapter }) => {
      const executablePath = "C:\\Program Files\\DevStation\\agent's.exe"
      const spec = adapter.buildLaunch({
        cwd: 'C:\\repo',
        devStationSessionId: 'session-1',
        agentRunId: 'run-1',
        settings: {},
        executablePath
      })

      expect(() => validateAgentLaunchSpec(spec)).not.toThrow()
      const encoded = encodePowerShellInvocation(spec)
      if (adapter.descriptor.id === 'test-agent') {
        expect(spec.executable).toBe('powershell.exe')
      } else {
        expect(spec.executable).toBe(executablePath)
        expect(encoded).toContain("agent''s.exe'")
      }
    }
  )

  it.each(cases())(
    '$adapter.descriptor.id degrades resume and native identity according to capabilities',
    ({ adapter, validRef, expectedResumeArgs }) => {
      const context = {
        cwd: 'C:\\repo',
        devStationSessionId: 'session-1',
        agentRunId: 'run-1',
        settings: {},
        executablePath: 'C:\\tools\\agent.exe'
      }

      expect(adapter.validateSessionRef({ kind: 'unsafe', value: "x'; exit" })).toBeNull()
      if (validRef === null) {
        expect(adapter.descriptor.capabilities.resume).toBe(false)
        expect(adapter.descriptor.capabilities.sessionIdentity).toBe(false)
        expect(adapter.buildResume(context, { kind: 'unknown', value: 'x' })).toBeNull()
        return
      }

      expect(adapter.descriptor.capabilities.resume).toBe(true)
      expect(adapter.descriptor.capabilities.sessionIdentity).toBe(true)
      expect(adapter.validateSessionRef(validRef)).toEqual(validRef)
      const resume = adapter.buildResume(context, validRef)
      expect(resume).not.toBeNull()
      expect(resume?.args).toEqual(expectedResumeArgs)
      expect(() => validateAgentLaunchSpec(resume!)).not.toThrow()
    }
  )
})
