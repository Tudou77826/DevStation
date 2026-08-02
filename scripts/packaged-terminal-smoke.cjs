const { _electron: electron } = require('@playwright/test')
const { mkdtemp, rm } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const executablePath = join(process.cwd(), 'release', 'win-unpacked', 'DevStation.exe')

async function launch(profile) {
  return electron.launch({
    executablePath,
    env: {
      ...process.env,
      DEVSTATION_PACKAGED_SMOKE: '1',
      DEVSTATION_PACKAGED_SMOKE_USER_DATA_DIR: profile,
      DEVSTATION_TERMINAL_HOST_IDLE_MS: '500'
    }
  })
}

async function closeGracefully(application) {
  const child = application.process()
  const exited = new Promise((resolve) => child.once('exit', resolve))
  await application.evaluate(({ app }) => setImmediate(() => app.quit()))
  await exited
}

async function terminalIdentity(page) {
  const state = page.getByText(/PowerShell · PID \d+/)
  await state.waitFor({ state: 'visible' })
  const text = await state.textContent()
  const pid = Number(text?.match(/PID (\d+)/)?.[1])
  const hostTitle = await state.locator('xpath=..').getAttribute('title')
  const hostPid = Number(hostTitle?.match(/Terminal Host PID (\d+)/)?.[1])
  if (!Number.isInteger(pid) || !Number.isInteger(hostPid)) {
    throw new Error(`Unable to read terminal identity: ${text}; ${hostTitle}`)
  }
  return { pid, hostPid }
}

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function terminateIfRunning(pid) {
  if (pid <= 0 || !processExists(pid)) return
  try {
    process.kill(pid)
  } catch {
    // The process can exit between the liveness check and termination.
  }
}

async function waitForProcessExit(pid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!processExists(pid)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Terminal host PID ${pid} did not exit after controlled cleanup`)
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('Packaged terminal lifecycle smoke is Windows-only; skipped.')
    return
  }
  if (!existsSync(executablePath)) {
    throw new Error(
      `Packaged app is missing: ${executablePath}. Run npm run build:win first.`
    )
  }

  const profile = await mkdtemp(join(tmpdir(), 'devstation-packaged-terminal-'))
  let application = null
  let hostPid = 0
  let terminalPid = 0
  let completed = false
  try {
    application = await launch(profile)
    let page = await application.firstWindow()
    await page.getByRole('button', { name: 'AI 空间' }).click()
    const first = await terminalIdentity(page)
    hostPid = first.hostPid
    terminalPid = first.pid

    const input = page.locator('.xterm-helper-textarea')
    await input.fill("Write-Output 'DEVSTATION_PACKAGED_PTY_ALIVE'")
    await input.press('Enter')
    await page
      .locator('.xterm-rows')
      .filter({ hasText: 'DEVSTATION_PACKAGED_PTY_ALIVE' })
      .waitFor()

    await closeGracefully(application)
    application = null

    application = await launch(profile)
    page = await application.firstWindow()
    await page.getByRole('button', { name: 'AI 空间' }).click()
    const resumed = await terminalIdentity(page)
    if (resumed.pid !== first.pid || resumed.hostPid !== first.hostPid) {
      throw new Error(
        `PTY was not reattached: ${JSON.stringify(first)} -> ${JSON.stringify(resumed)}`
      )
    }
    await page.getByText('已接回').waitFor()
    await page
      .locator('.xterm-rows')
      .filter({ hasText: 'DEVSTATION_PACKAGED_PTY_ALIVE' })
      .waitFor()

    await page.getByRole('button', { name: '结束进程' }).click()
    await page.getByText('进程已结束').waitFor()
    await closeGracefully(application)
    application = null
    await waitForProcessExit(hostPid)
    completed = true

    console.log(
      `Packaged terminal lifecycle smoke passed: PTY ${first.pid} reattached through host ${hostPid}, then both were cleaned up.`
    )
  } finally {
    if (application !== null) await closeGracefully(application).catch(() => undefined)
    if (!completed) {
      terminateIfRunning(terminalPid)
      terminateIfRunning(hostPid)
      if (hostPid > 0) await waitForProcessExit(hostPid).catch(() => undefined)
    }
    await rm(profile, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
