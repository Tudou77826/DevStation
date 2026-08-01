import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication
} from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
    await page.getByRole('button', { name: /持久化验收任务/ }).click()

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
    await page.getByRole('button', { name: /^项目/ }).click()
    await page.getByTitle('添加本地项目').click()
    try {
      await expect(page.getByRole('heading', { name: 'DevStation' })).toBeVisible()
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
    await page.getByLabel('关联项目').selectOption({ label: 'DevStation' })

    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: /^项目/ }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '移除项目 DevStation' }).click()
    await expect(page.getByRole('heading', { name: 'DevStation' })).toBeVisible()
    await expect(page.getByText(/仍被任务或会话引用/)).toBeVisible()

    await page.getByRole('button', { name: '任务面板' }).click()
    await page.getByLabel('关联项目').selectOption('')
    await page.getByRole('button', { name: 'AI 空间' }).click()
    await page.getByRole('button', { name: /^项目/ }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '移除项目 DevStation' }).click()
    await expect(page.getByRole('heading', { name: 'DevStation' })).toHaveCount(0)
  } finally {
    await closeQuietly(app)
    await rm(profile, { recursive: true, force: true })
  }
})
