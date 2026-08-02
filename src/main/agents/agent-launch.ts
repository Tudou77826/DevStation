import { isAbsolute } from 'node:path'
import type { AgentLaunchSpec } from '@shared/agent'

const SAFE_COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SAFE_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const MAX_ARGUMENTS = 200
const MAX_VALUE_LENGTH = 4_096

export function encodePowerShellInvocation(spec: AgentLaunchSpec): string {
  validateAgentLaunchSpec(spec)
  const environment = Object.entries(spec.env).map(
    ([key, value]) => `$env:${key} = ${quotePowerShell(value)}`
  )
  const invocation = [
    '&',
    quotePowerShell(spec.executable),
    ...spec.args.map(quotePowerShell)
  ].join(' ')
  return [...environment, invocation].join('; ')
}

export function validateAgentLaunchSpec(spec: AgentLaunchSpec): void {
  if (spec === null || typeof spec !== 'object') throw new Error('Invalid Agent launch')
  if (!isSafeExecutable(spec.executable)) throw new Error('Invalid Agent executable')
  if (!Array.isArray(spec.args) || spec.args.length > MAX_ARGUMENTS) {
    throw new Error('Invalid Agent arguments')
  }
  for (const argument of spec.args) validateValue(argument, 'Agent argument')
  if (spec.env === null || typeof spec.env !== 'object' || Array.isArray(spec.env)) {
    throw new Error('Invalid Agent environment')
  }
  for (const [key, value] of Object.entries(spec.env)) {
    if (!SAFE_ENV_NAME.test(key)) throw new Error('Invalid Agent environment name')
    validateValue(value, 'Agent environment value')
  }
}

function isSafeExecutable(value: string): boolean {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_VALUE_LENGTH
  ) {
    return false
  }
  if (hasControlCharacters(value)) return false
  return SAFE_COMMAND_NAME.test(value) || isAbsolute(value)
}

function validateValue(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length > MAX_VALUE_LENGTH ||
    hasControlCharacters(value)
  ) {
    throw new Error(`Invalid ${label}`)
  }
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
