const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const lock = JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8'))
const allowed = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD'
])
const violations = []
let checked = 0

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (packagePath === '' || metadata.dev === true) continue
  checked += 1
  const license = metadata.license
  if (typeof license !== 'string' || !allowed.has(license)) {
    violations.push(`${packagePath}: ${license ?? 'UNKNOWN'}`)
  }
}

if (violations.length > 0) {
  console.error('Production dependency license policy violations:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log(`License check passed for ${checked} production dependency packages.`)
}
