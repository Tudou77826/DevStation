import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication
} from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, delimiter, join } from 'node:path'

const workspaceRoot = process.cwd()

async function launch(
  profile: string,
  extraEnv: Record<string, string> = {}
): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DEVSTATION_E2E: '1',
      DEVSTATION_E2E_USER_DATA_DIR: profile,
      ...extraEnv
    }
  })
}

async function closeQuietly(app: ElectronApplication | null): Promise<void> {
  if (app === null) return
  try {
    const child = app.process()
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    await app.evaluate(({ app }) => {
      setImmediate(() => app.quit())
    })
    await exited
  } catch {
    // A failed assertion can race with Electron shutdown; cleanup is best effort.
  }
}

test('Coding Agent 设置可诊断并显式启停事件集成', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile)
    const page = await app.firstWindow()

    await page.getByRole('button', { name: /李工/ }).click()
    await page.getByRole('menuitem', { name: 'Agent 设置' }).click()
    await expect(page.getByRole('heading', { name: 'Coding Agent' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Test Agent', exact: true })
    ).toBeVisible()
    const testAgentCard = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Test Agent', exact: true })
    })
    await expect(
      testAgentCard.getByText('检测通过，后续新建和恢复会话将使用此程序。')
    ).toBeVisible()

    const alternateCard = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Test Agent Alternate' })
    })
    await alternateCard.getByLabel('启动模式').selectOption('verbose')
    await expect(alternateCard.getByLabel('启动模式')).toHaveValue('verbose')
    await expect(alternateCard.getByText('检测测试 Agent')).toBeVisible()

    const openCodeCard = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'OpenCode' })
    })
    await openCodeCard.getByRole('button', { name: '停用' }).click()
    await expect(openCodeCard.getByText('已停用')).toBeVisible()
    await openCodeCard.getByRole('button', { name: '启用' }).click()
    await expect(openCodeCard.getByText('已接入')).toBeVisible()
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('任务、状态和工作会话在重启后恢复', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile)
    let page = await app.firstWindow()

    await page.getByTitle('新建任务').click()
    const title = page.getByLabel('任务标题')
    await title.fill('持久化验收任务')
    await title.press('Enter')
    await page.getByLabel('任务状态').selectOption('done')
    await page.getByRole('button', { name: '新建工作会话' }).click()
    await expect(page.getByText('1 个会话')).toBeVisible()

    await closeQuietly(app)
    app = null

    app = await launch(profile)
    page = await app.firstWindow()

    await expect(page.getByLabel('任务标题')).toHaveValue('持久化验收任务')
    await expect(page.getByLabel('任务状态')).toHaveValue('done')
    await expect(page.getByText('1 个会话')).toBeVisible()
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('删除任务必须确认，并级联删除其工作会话', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile)
    const page = await app.firstWindow()

    await page.getByTitle('新建任务').click()
    const title = page.getByLabel('任务标题')
    await title.fill('待删除验收任务')
    await title.press('Enter')
    await page.getByRole('button', { name: '新建工作会话' }).click()
    await expect(page.getByText('1 个会话')).toBeVisible()

    await page.getByRole('button', { name: '删除任务' }).click()
    await expect(page.getByRole('alertdialog', { name: '确认删除任务' })).toBeVisible()
    await page.getByRole('button', { name: '确认删除' }).click()

    await expect(page.getByRole('button', { name: /待删除验收任务/ })).toHaveCount(0)
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('项目被任务引用时不可删除，解除引用后可以删除', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile, { DEVSTATION_E2E_PROJECT_PATH: workspaceRoot })
    const page = await app.firstWindow()

    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: '添加本地项目' }).click()
    try {
      await expect(
        page
          .getByRole('region', { name: 'AI 空间工作区' })
          .getByText('DevStation', { exact: true })
      ).toBeVisible()
    } catch (error) {
      throw new Error(
        `添加项目失败，当前界面：\n${await page.locator('body').innerText()}`,
        {
          cause: error
        }
      )
    }

    await page.getByRole('button', { name: '任务面板' }).click()
    await page.getByTitle('新建任务').click()
    const projectOption = page
      .getByLabel('关联项目')
      .locator('option')
      .filter({ hasText: 'DevStation' })
    await expect(projectOption).toHaveCSS('background-color', 'rgb(17, 17, 17)')
    await expect(projectOption).toHaveCSS('color', 'rgb(250, 250, 250)')
    await page.getByLabel('关联项目').selectOption({ label: 'DevStation' })

    await page.getByRole('button', { name: 'AI 空间' }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '移除项目 DevStation' }).click()
    await expect(
      page
        .getByRole('region', { name: 'AI 空间工作区' })
        .getByText('DevStation', { exact: true })
    ).toBeVisible()
    await expect(page.getByText(/仍被任务或会话引用/)).toBeVisible()

    await page.getByRole('button', { name: '任务面板' }).click()
    await page.getByLabel('关联项目').selectOption('')
    await page.getByRole('button', { name: 'AI 空间' }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '移除项目 DevStation' }).click()
    await expect(page.getByRole('button', { name: '移除项目 DevStation' })).toHaveCount(0)
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('右侧栏可重新呼出，并跟随当前一级工作区', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile)
    const page = await app.firstWindow()
    const inspector = page.getByRole('complementary', { name: '上下文侧栏' })

    await expect(inspector).toContainText('附属信息')
    await page.getByRole('button', { name: '收起右侧栏' }).click()
    await expect(inspector).toHaveCount(0)
    await page.getByRole('button', { name: '打开附属栏' }).click()
    await expect(inspector).toContainText('附属信息')

    await page.getByRole('button', { name: 'AI 空间' }).click()
    await expect(inspector).toContainText('项目上下文')
    await page.getByRole('button', { name: '收起右侧栏' }).click()
    await page.getByRole('button', { name: '打开文件' }).click()
    await expect(inspector).toContainText('项目上下文')
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('任务详情中的工作会话可直达对应 AI 工作区', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile, { DEVSTATION_E2E_PROJECT_PATH: workspaceRoot })
    const page = await app.firstWindow()

    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: '添加本地项目' }).click()
    await page.getByRole('button', { name: '任务面板' }).click()
    await page.getByTitle('新建任务').click()
    const title = page.getByLabel('任务标题')
    await title.fill('会话直达验收')
    await title.press('Enter')
    await page.getByLabel('关联项目').selectOption({ label: 'DevStation' })
    await page.getByLabel('Coding Agent').selectOption('test-agent-alt')
    await page.getByRole('button', { name: '新建工作会话' }).click()

    await page.getByRole('button', { name: /会话直达验收 会话/ }).click()

    const aiWorkspace = page.getByRole('region', { name: 'AI 空间工作区' })
    await expect(aiWorkspace).toBeVisible()
    await expect(
      page.getByText(/Test Agent Alternate .* PowerShell .* PID \d+/)
    ).toBeVisible()
    await expect(page.locator('.xterm-rows')).toContainText(
      'DEVSTATION_TEST_AGENT_ALT_COMPACT_READY'
    )
    await expect(page.locator('.xterm-rows')).not.toContainText('$env:DEVSTATION_')
    await expect(page.locator('.xterm-rows')).not.toContainText(
      'DEVSTATION_AGENT_EVENT_TOKEN'
    )
    await expect(
      aiWorkspace.getByText('会话直达验收 会话', { exact: true })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /会话直达验收 会话/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('AI 工作区在应用重启后接回同一个 PowerShell PTY', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile, {
      DEVSTATION_E2E_PROJECT_PATH: workspaceRoot,
      DEVSTATION_E2E_KEEP_TERMINAL_HOST: '1'
    })
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: '添加本地项目' }).click()
    await expect(page.getByText(/PowerShell · PID \d+/)).toBeVisible()
    const firstHeader = await page.getByText(/PowerShell · PID \d+/).textContent()
    const pid = firstHeader?.match(/PID (\d+)/)?.[1]
    expect(pid).toBeTruthy()

    const terminalInput = page.locator('.xterm-helper-textarea')
    await terminalInput.fill("Write-Output 'DEVSTATION_PTY_ALIVE'")
    await terminalInput.press('Enter')
    await expect(page.locator('.xterm-rows')).toContainText('DEVSTATION_PTY_ALIVE')

    await closeQuietly(app)
    app = null

    app = await launch(profile, { DEVSTATION_E2E_PROJECT_PATH: workspaceRoot })
    page = await app.firstWindow()

    await expect(page.getByRole('region', { name: 'AI 空间工作区' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'DevStation', exact: true })
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText(`PowerShell · PID ${pid}`)).toBeVisible()
    await expect(page.getByText('已接回')).toBeVisible()
    await expect(page.locator('.xterm-rows')).toContainText('DEVSTATION_PTY_ALIVE')
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('当前仓库变更、Diff 与本地行级意见在重启后恢复', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'devstation-e2e-'))
  const repo = await mkdtemp(join(tmpdir(), 'devstation-review-repo-'))
  let app: ElectronApplication | null = null

  try {
    execFileSync('git', ['init', repo])
    execFileSync('git', ['-C', repo, 'config', 'user.email', 'devstation@example.test'])
    execFileSync('git', ['-C', repo, 'config', 'user.name', 'DevStation Test'])
    await writeFile(join(repo, 'review.ts'), 'export const before = 1\n')
    execFileSync('git', ['-C', repo, 'add', 'review.ts'])
    execFileSync('git', ['-C', repo, 'commit', '-m', 'base'])
    await writeFile(join(repo, 'review.ts'), 'export const after = 2\n')

    app = await launch(profile, { DEVSTATION_E2E_PROJECT_PATH: repo })
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: '添加本地项目' }).click()
    await page.getByRole('button', { name: '任务面板' }).click()
    await page.getByTitle('新建任务').click()
    await page.getByLabel('任务标题').fill('Diff 验收')
    await page.getByLabel('任务标题').press('Enter')
    await page.getByLabel('关联项目').selectOption({ label: basename(repo) })
    await page.getByRole('button', { name: '新建工作会话' }).click()
    await page.getByRole('button', { name: /Diff 验收 会话/ }).click()

    await page
      .getByRole('region', { name: 'AI 空间工作区' })
      .getByRole('button', { name: '变更', exact: true })
      .click()
    const inspector = page.getByRole('complementary', { name: '上下文侧栏' })
    await expect(inspector.getByText('review.ts')).toBeVisible()
    await inspector.getByText('review.ts').click()
    await expect(inspector.getByText('export const after = 2')).toBeVisible()
    await inspector
      .getByText('export const after = 2')
      .locator('..')
      .getByRole('button', { name: '添加行级意见' })
      .click()
    await inspector.getByPlaceholder('记录评审意见…').fill('确认常量命名是否符合约定')
    await inspector.getByRole('button', { name: '保存' }).click()
    await expect(inspector.getByText('确认常量命名是否符合约定')).toBeVisible()

    await page.getByRole('button', { name: '结束进程' }).click()
    await closeQuietly(app)
    app = null
    app = await launch(profile, { DEVSTATION_E2E_PROJECT_PATH: repo })
    page = await app.firstWindow()
    await page
      .getByRole('region', { name: 'AI 空间工作区' })
      .getByRole('button', { name: '变更', exact: true })
      .click()
    const restoredInspector = page.getByRole('complementary', { name: '上下文侧栏' })
    await restoredInspector.getByText('review.ts').click()
    await expect(restoredInspector.getByText('确认常量命名是否符合约定')).toBeVisible()
    await page.getByRole('button', { name: '结束进程' }).click()
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
    await rm(repo, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})

test('本机 OpenCode smoke：会话终端启动真实 OpenCode 进程', async () => {
  test.skip(
    process.env['DEVSTATION_OPENCODE_SMOKE'] !== '1',
    '依赖本机 OpenCode 安装，不进入确定性 PR 门禁'
  )
  const profile = await mkdtemp(join(tmpdir(), 'devstation-opencode-e2e-'))
  let app: ElectronApplication | null = null

  try {
    app = await launch(profile, { DEVSTATION_E2E_PROJECT_PATH: workspaceRoot })
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: '添加本地项目' }).click()
    await page.getByRole('button', { name: '任务面板' }).click()
    await page.getByTitle('新建任务').click()
    const title = page.getByLabel('任务标题')
    await title.fill('OpenCode smoke')
    await title.press('Enter')
    await page.getByLabel('关联项目').selectOption({ label: 'DevStation' })
    await page.getByRole('button', { name: '新建工作会话' }).click()

    await page.getByRole('button', { name: /OpenCode smoke 会话/ }).click()
    await expect(page.getByText(/OpenCode · PowerShell · PID \d+/)).toBeVisible()
    await page.waitForTimeout(2_000)
    const header = await page.getByText(/OpenCode · PowerShell · PID \d+/).textContent()
    const powershellPid = header?.match(/PID (\d+)/)?.[1]
    expect(powershellPid).toBeTruthy()
    const children = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${powershellPid}").CommandLine`
      ],
      { encoding: 'utf8' }
    )
    expect(children.toLowerCase()).toContain('opencode')
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})

test('本机 Chrys smoke：会话终端启动真实 Chrys TUI 并接收生命周期事件', async () => {
  const chrysBinDir = process.env['DEVSTATION_CHRYS_BIN_DIR']
  test.skip(
    process.env['DEVSTATION_CHRYS_SMOKE'] !== '1' || chrysBinDir === undefined,
    '依赖显式指定的本机 Chrys 安装，不进入确定性 PR 门禁'
  )
  const profile = await mkdtemp(join(tmpdir(), 'devstation-chrys-e2e-'))
  let app: ElectronApplication | null = null

  try {
    const path = `${chrysBinDir}${delimiter}${process.env['PATH'] ?? ''}`
    app = await launch(profile, {
      DEVSTATION_E2E_PROJECT_PATH: workspaceRoot,
      PATH: path,
      APPDATA: join(profile, 'integrations')
    })
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: '添加本地项目' }).click()
    await page.getByRole('button', { name: '任务面板' }).click()
    await page.getByTitle('新建任务').click()
    const title = page.getByLabel('任务标题')
    await title.fill('Chrys smoke')
    await title.press('Enter')
    await page.getByLabel('关联项目').selectOption({ label: 'DevStation' })
    await page.getByLabel('Coding Agent').selectOption('chrys')
    await page.getByRole('button', { name: '新建工作会话' }).click()

    await page.getByRole('button', { name: /Chrys smoke 会话/ }).click()
    await expect(page.getByText(/Chrys · PowerShell · PID \d+/)).toBeVisible()
    const header = await page.getByText(/Chrys · PowerShell · PID \d+/).textContent()
    const powershellPid = header?.match(/PID (\d+)/)?.[1]
    expect(powershellPid).toBeTruthy()
    await expect
      .poll(
        () =>
          execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${powershellPid}").CommandLine`
            ],
            { encoding: 'utf8' }
          ).toLowerCase(),
        { timeout: 15_000 }
      )
      .toContain('chrys')

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const tasks = await window.devstation.rpc.invoke('tasks.list', {
              keyword: 'Chrys smoke'
            })
            if (!tasks.ok || tasks.result.length === 0) return null
            const sessions = await window.devstation.rpc.invoke('sessions.listByTask', {
              taskId: tasks.result[0].id
            })
            if (!sessions.ok || sessions.result.length === 0) return null
            return sessions.result[0].agentSessionRef?.value ?? ''
          }),
        { timeout: 30_000 }
      )
      .toMatch(/^[0-9a-f-]{36}$/i)
    const nativeSessionId = await page.evaluate(async () => {
      const tasks = await window.devstation.rpc.invoke('tasks.list', {
        keyword: 'Chrys smoke'
      })
      if (!tasks.ok || tasks.result.length === 0) throw new Error('Smoke task not found')
      const sessions = await window.devstation.rpc.invoke('sessions.listByTask', {
        taskId: tasks.result[0].id
      })
      if (!sessions.ok || sessions.result.length === 0) {
        throw new Error('Smoke session not found')
      }
      const value = sessions.result[0].agentSessionRef?.value
      if (value === undefined) throw new Error('Chrys session id was not bound')
      return value
    })

    await page.getByRole('button', { name: '结束进程' }).click()
    await expect(page.getByRole('button', { name: '重新连接' })).toBeVisible({
      timeout: 15_000
    })
    await page.getByRole('button', { name: '重新连接' }).click()
    await expect(page.getByText('已发起恢复')).toBeVisible({ timeout: 15_000 })
    const resumedHeader = await page
      .getByText(/Chrys · PowerShell · PID \d+/)
      .textContent()
    const resumedPowershellPid = resumedHeader?.match(/PID (\d+)/)?.[1]
    expect(resumedPowershellPid).toBeTruthy()
    expect(resumedPowershellPid).not.toBe(powershellPid)
    await expect
      .poll(
        () =>
          execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${resumedPowershellPid}").CommandLine`
            ],
            { encoding: 'utf8' }
          ).toLowerCase(),
        { timeout: 15_000 }
      )
      .toContain(nativeSessionId.toLowerCase())

    await page.getByRole('button', { name: '任务面板' }).click()
    await expect(page.getByText('Chrys smoke 会话')).toBeVisible()
    await expect(page.getByText('启动中')).toBeVisible({ timeout: 15_000 })
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})
