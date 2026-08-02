import { describe, expect, it, vi } from 'vitest'
import type { CodingAgentAdapter } from './adapter'
import { Database } from '../db/database'
import { AgentSettingsRepo } from '../db/repositories'
import { initializeDatabase } from '../db/schema'
import { AgentRegistry } from './registry'
import { AgentSettingsService } from './settings-service'

function adapter(): CodingAgentAdapter {
  return {
    descriptor: {
      id: 'configurable-agent',
      label: 'Configurable Agent',
      description: '',
      capabilities: {
        resume: false,
        sessionIdentity: false,
        activityEvents: false,
        transcript: false
      },
      settings: {
        version: 2,
        fields: [
          {
            key: 'enabled-feature',
            label: 'Enabled feature',
            kind: 'boolean',
            required: true,
            defaultValue: true
          },
          {
            key: 'workspace-path',
            label: 'Workspace path',
            kind: 'path',
            required: false
          },
          {
            key: 'response-mode',
            label: 'Response mode',
            kind: 'select',
            required: true,
            defaultValue: 'compact',
            options: [
              { value: 'compact', label: 'Compact' },
              { value: 'verbose', label: 'Verbose' }
            ]
          }
        ],
        actions: []
      },
      setupSteps: []
    },
    probe: vi.fn(async () => ({
      status: 'available' as const,
      executable: 'configurable-agent',
      version: '1',
      message: null
    })),
    buildLaunch: vi.fn(() => ({
      executable: 'configurable-agent',
      args: [],
      env: {}
    })),
    buildResume: vi.fn(() => null),
    validateSessionRef: vi.fn(() => null)
  }
}

describe('AgentSettingsService', () => {
  it('projects stored values through the current schema without deleting legacy data', () => {
    const db = new Database(':memory:')
    initializeDatabase(db)
    const repository = new AgentSettingsRepo(db)
    repository.setValues('configurable-agent', 1, {
      'response-mode': 'verbose',
      'enabled-feature': 'invalid-historical-value',
      'removed-setting': 'keep-for-adapter-rollback'
    })
    const service = new AgentSettingsService(new AgentRegistry([adapter()]), repository)

    expect(service.effective('configurable-agent')).toMatchObject({
      schemaVersion: 2,
      values: {
        'enabled-feature': true,
        'response-mode': 'verbose'
      }
    })

    service.setValue('configurable-agent', 'response-mode', 'compact')
    expect(repository.effective('configurable-agent')).toMatchObject({
      schemaVersion: 2,
      values: {
        'response-mode': 'compact',
        'enabled-feature': 'invalid-historical-value',
        'removed-setting': 'keep-for-adapter-rollback'
      }
    })
    db.close()
  })

  it('rejects unknown, mistyped and unsafe values at the Main boundary', () => {
    const db = new Database(':memory:')
    initializeDatabase(db)
    const service = new AgentSettingsService(
      new AgentRegistry([adapter()]),
      new AgentSettingsRepo(db)
    )

    expect(() => service.setValue('configurable-agent', 'missing', 'value')).toThrow(
      'Unknown Coding Agent setting'
    )
    expect(() =>
      service.setValue('configurable-agent', 'enabled-feature', 'true')
    ).toThrow('Invalid setting')
    expect(() =>
      service.setValue('configurable-agent', 'response-mode', 'unsupported')
    ).toThrow('Unsupported setting option')
    expect(() =>
      service.setValue('configurable-agent', 'workspace-path', 'relative/path')
    ).toThrow('must be absolute')
    expect(() =>
      service.setValue('configurable-agent', 'workspace-path', 'C:\\safe\nunsafe')
    ).toThrow('Invalid setting')
    db.close()
  })
})
