import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodePowerShellInvocation, validateAgentLaunchSpec } from './agent-launch'

describe('Agent launch boundary', () => {
  it('quotes every adapter value as PowerShell data', () => {
    expect(
      encodePowerShellInvocation({
        executable: 'opencode',
        args: ['--session', "ses_ok'; Remove-Item *"],
        env: { DEVSTATION_AGENT_RUN_ID: "run'; exit" }
      })
    ).toBe(
      "$env:DEVSTATION_AGENT_RUN_ID = 'run''; exit'; & 'opencode' '--session' 'ses_ok''; Remove-Item *'"
    )
  })

  it('accepts a safe command name or absolute executable path', () => {
    expect(() =>
      validateAgentLaunchSpec({ executable: 'claude.exe', args: [], env: {} })
    ).not.toThrow()
    expect(() =>
      validateAgentLaunchSpec({
        executable: join(process.cwd(), 'agent.exe'),
        args: [],
        env: {}
      })
    ).not.toThrow()
  })

  it('rejects command composition, control characters and unbounded argv', () => {
    expect(() =>
      validateAgentLaunchSpec({ executable: 'opencode; exit', args: [], env: {} })
    ).toThrow('Invalid Agent executable')
    expect(() =>
      validateAgentLaunchSpec({ executable: 'opencode', args: ['bad\narg'], env: {} })
    ).toThrow('Invalid Agent argument')
    expect(() =>
      validateAgentLaunchSpec({
        executable: 'opencode',
        args: Array.from({ length: 201 }, () => 'x'),
        env: {}
      })
    ).toThrow('Invalid Agent arguments')
    expect(() =>
      validateAgentLaunchSpec({
        executable: 'opencode',
        args: [],
        env: { 'BAD-NAME': 'x' }
      })
    ).toThrow('Invalid Agent environment name')
  })
})
