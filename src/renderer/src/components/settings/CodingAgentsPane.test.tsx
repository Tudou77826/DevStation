// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentDiagnosticEntry } from '@shared/agent'
import type { RpcResponse } from '@shared/rpc'

const invoke = vi.fn()
Object.defineProperty(window, 'devstation', {
  configurable: true,
  value: { rpc: { invoke } }
})

const { CodingAgentsPane } = await import('./CodingAgentsPane')

function ok<T>(result: T): RpcResponse<T> {
  return { ok: true, result }
}

function diagnostic(patch: Partial<AgentDiagnosticEntry> = {}): AgentDiagnosticEntry {
  return {
    descriptor: {
      id: 'chrys',
      label: 'Chrys',
      description: '企业 Coding Agent',
      capabilities: {
        resume: true,
        sessionIdentity: true,
        activityEvents: true,
        transcript: false
      },
      settings: {
        version: 1,
        fields: [
          {
            key: 'mode',
            label: '启动模式',
            kind: 'select',
            required: true,
            defaultValue: 'compact',
            options: [
              { value: 'compact', label: '精简' },
              { value: 'verbose', label: '详细' }
            ]
          }
        ],
        actions: [{ id: 'probe', label: '重新检测', kind: 'probe' }]
      },
      setupSteps: [
        {
          id: 'verify',
          title: '检测 Agent',
          description: '确认命令可用。',
          actionId: 'probe'
        }
      ]
    },
    settings: {
      agentId: 'chrys',
      enabled: true,
      integrationEnabled: true,
      executablePath: 'D:\\venv\\chrys.exe',
      isDefault: false,
      schemaVersion: 1,
      values: { mode: 'compact' },
      updatedAt: 1
    },
    availability: {
      status: 'available',
      executable: 'D:\\venv\\chrys.exe',
      version: '2.0.0',
      message: null
    },
    integration: { state: 'outdated', message: '需要更新托管 Hook' },
    ...patch
  }
}

afterEach(cleanup)

describe('CodingAgentsPane', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockImplementation(async (method: string) => {
      if (method === 'agents.diagnostics') return ok([diagnostic()])
      if (method === 'agents.list') return ok([])
      return ok({})
    })
  })

  it('shows runtime truth, capabilities and the actionable integration diagnosis', async () => {
    render(<CodingAgentsPane />)

    expect(await screen.findByText('Chrys')).toBeTruthy()
    expect(screen.getByText('2.0.0')).toBeTruthy()
    expect(screen.getByText('D:\\venv\\chrys.exe')).toBeTruthy()
    expect(screen.getByText('恢复会话')).toBeTruthy()
    expect(screen.getByText('需要更新')).toBeTruthy()
    expect(screen.getByRole('button', { name: '修复' })).toBeTruthy()
    expect(screen.getByLabelText('启动模式')).toBeTruthy()
    expect(screen.getByText('检测 Agent')).toBeTruthy()
  })

  it('routes state changes through typed RPC and refreshes both diagnostics and session choices', async () => {
    render(<CodingAgentsPane />)
    const enabledSwitch = await screen.findByRole('switch', { name: '启用 Chrys' })
    fireEvent.click(enabledSwitch)

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('agents.setEnabled', {
        agentId: 'chrys',
        enabled: false
      })
    )
    await waitFor(() => {
      expect(
        invoke.mock.calls.filter(([method]) => method === 'agents.diagnostics').length
      ).toBeGreaterThan(1)
      expect(invoke).toHaveBeenCalledWith('agents.list', {})
    })
  })

  it('persists a Schema-driven setting through the typed Main RPC', async () => {
    render(<CodingAgentsPane />)
    const mode = await screen.findByLabelText('启动模式')
    fireEvent.change(mode, { target: { value: 'verbose' } })

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('agents.setSetting', {
        agentId: 'chrys',
        key: 'mode',
        value: 'verbose'
      })
    )
  })
})
