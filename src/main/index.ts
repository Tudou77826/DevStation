import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { TerminalManager } from './terminal/terminal-manager'
import { TerminalHostClient } from './terminal/terminal-host-client'
import { OpenCodeSessionLocator } from './agents/opencode-session-locator'
import { OpenCodeAdapter } from './agents/opencode-adapter'
import { OpenCodeManagedIntegration } from './agents/opencode-managed-integration'
import { AgentRegistry } from './agents/registry'
import { AgentRuntimeService } from './agents/runtime-service'
import { ManagedEventBridge } from './agents/managed-event-bridge'
import { AgentEventInbox } from './agents/agent-event-inbox'
import { Database } from './db/database'
import { initializeDatabase } from './db/schema'
import { ProjectRepo, SessionRepo, TaskRepo } from './db/repositories'
import { buildRegistry } from './rpc/methods'
import { createDispatcher } from './rpc/dispatcher'
import type { RpcContext } from './rpc/core'

const __dirname = dirname(fileURLToPath(import.meta.url))

// End-to-end tests must never touch a developer's real Electron profile. The
// override is deliberately restricted to unpackaged builds and an explicit
// test flag so production launches cannot redirect user data accidentally.
const e2eUserDataDir = process.env['DEVSTATION_E2E_USER_DATA_DIR']
if (!app.isPackaged && process.env['DEVSTATION_E2E'] === '1' && e2eUserDataDir) {
  mkdirSync(e2eUserDataDir, { recursive: true })
  app.setPath('userData', e2eUserDataDir)
}

// The packaged lifecycle smoke needs an isolated profile without touching a
// developer's real data. Restrict the override to an explicit smoke flag and
// our own temporary-directory prefix; ordinary production launches cannot
// redirect the database or terminal host endpoint.
const packagedSmokeUserDataDir = process.env['DEVSTATION_PACKAGED_SMOKE_USER_DATA_DIR']
if (
  app.isPackaged &&
  process.env['DEVSTATION_PACKAGED_SMOKE'] === '1' &&
  packagedSmokeUserDataDir &&
  isAbsolute(packagedSmokeUserDataDir) &&
  basename(packagedSmokeUserDataDir).startsWith('devstation-packaged-terminal-')
) {
  mkdirSync(packagedSmokeUserDataDir, { recursive: true })
  app.setPath('userData', packagedSmokeUserDataDir)
}

let mainWindow: BrowserWindow | null = null
let terminalManager: TerminalManager | null = null
let agentEventInbox: AgentEventInbox | null = null
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) app.quit()

// Persistence (initialized lazily after app.ready). Closed on before-quit.
let db: Database | null = null

// Window chrome colors per theme. backgroundColor is applied at window
// creation and on theme change; on Windows the title bar overlay (caption
// buttons) is recolored via setTitleBarOverlay so it matches the theme too.
const THEME_CHROME = {
  dark: { background: '#0a0a0a', titleBar: '#0a0a0a', symbol: '#a3a3a3' },
  light: { background: '#ffffff', titleBar: '#ffffff', symbol: '#525252' }
} as const

function applyWindowChrome(window: BrowserWindow, theme: 'dark' | 'light'): void {
  const chrome = THEME_CHROME[theme]
  void window.setBackgroundColor(chrome.background)
  // setTitleBarOverlay is only available when a custom titleBar overlay is
  // active; it no-ops safely otherwise. Guard for platforms/versions lacking it.
  type OverlayCapable = BrowserWindow & {
    setTitleBarOverlay?: (opts: { color: string; symbolColor: string }) => void
  }
  const overlay = (window as OverlayCapable).setTitleBarOverlay
  if (typeof overlay === 'function') {
    try {
      overlay.call(window, { color: chrome.titleBar, symbolColor: chrome.symbol })
    } catch {
      // ignore — overlay not supported on this platform/build
    }
  }
}

function isAllowedRendererNavigation(url: string): boolean {
  try {
    const candidate = new URL(url)
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl !== undefined) return candidate.origin === new URL(devUrl).origin
    const entry = new URL(pathToFileURL(join(__dirname, '../renderer/index.html')).href)
    return candidate.protocol === 'file:' && candidate.pathname === entry.pathname
  } catch {
    return false
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'DevStation',
    backgroundColor: THEME_CHROME.dark.background,
    // Custom title bar overlay: keeps native caption buttons (Win/mac) but
    // lets us recolor the title-bar strip so it follows the app theme instead
    // of the OS theme. On Linux this falls back to the default frame.
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'default',
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            color: THEME_CHROME.dark.titleBar,
            symbolColor: THEME_CHROME.dark.symbol,
            height: 36
          }
        : undefined,
    frame: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })
  terminalManager?.watch(mainWindow.webContents)

  // Open external links in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(url)) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
  })

  // electron-vite dev server in dev, built file in production.
  if (process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Initialize SQLite + run migrations. On failure, show an error dialog and quit
 * rather than leaving a window open with no backing store.
 * Resolves to the repositories bound to the open DB.
 */
function initPersistence(): {
  tasks: TaskRepo
  projects: ProjectRepo
  sessions: SessionRepo
} {
  const dbPath = join(app.getPath('userData'), 'devstation.db')
  const database = new Database(dbPath)
  initializeDatabase(database)
  db = database
  return {
    tasks: new TaskRepo(database),
    projects: new ProjectRepo(database),
    sessions: new SessionRepo(database)
  }
}

// Ensure single instance before any window logic.
void app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  // 1. persistence first — if it fails, abort cleanly with a user-visible error.
  let repositories
  try {
    repositories = initPersistence()
  } catch (err) {
    console.error('[DevStation] database initialization failed:', err)
    dialog.showErrorBox(
      'DevStation 无法启动',
      '本地数据库初始化失败，应用将退出。请检查磁盘空间与读写权限后重试。'
    )
    app.quit()
    return
  }

  // 2. RPC dispatcher on a single channel, sender-bound context.
  const registry = buildRegistry()
  const dispatcher = createDispatcher(
    registry,
    (sender): RpcContext => {
      return { repositories, sender: BrowserWindow.fromWebContents(sender) }
    },
    (sender) =>
      mainWindow !== null &&
      !mainWindow.isDestroyed() &&
      sender.id === mainWindow.webContents.id
  )
  ipcMain.handle('rpc', dispatcher)

  // 3. native theme, terminal boundary and window.
  ipcMain.handle('theme:update', (_event, theme: 'dark' | 'light') => {
    if (theme !== 'dark' && theme !== 'light') throw new Error('Unsupported theme')
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (senderWindow !== null) applyWindowChrome(senderWindow, theme)
    return true
  })
  const terminalHost = new TerminalHostClient({
    userDataPath: app.getPath('userData'),
    hostEntryPath: join(__dirname, 'terminal-host.js')
  })
  const isolateExternalIntegrations =
    process.env['DEVSTATION_E2E'] === '1' ||
    process.env['DEVSTATION_PACKAGED_SMOKE'] === '1'
  const openCodeIntegration = new OpenCodeManagedIntegration(
    isolateExternalIntegrations
      ? { configRoot: join(app.getPath('userData'), 'integrations', 'opencode') }
      : {}
  )
  const integrationDiagnostic = openCodeIntegration.ensureInstalled()
  if (integrationDiagnostic.state !== 'current') {
    console.warn(
      '[DevStation] OpenCode event integration unavailable:',
      integrationDiagnostic
    )
  }
  const agentRegistry = new AgentRegistry([
    new OpenCodeAdapter(new OpenCodeSessionLocator(), openCodeIntegration)
  ])
  let eventBridge: ManagedEventBridge | undefined
  try {
    eventBridge = new ManagedEventBridge(join(app.getPath('userData'), 'agent-events'))
    eventBridge.ensureInstalled()
    agentEventInbox = new AgentEventInbox({
      inboxRoot: eventBridge.inboxRoot,
      registry: agentRegistry,
      sessions: repositories.sessions,
      onSessionUpdated: (session) => {
        if (mainWindow !== null && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:session-updated', session)
        }
      }
    })
    agentEventInbox.start()
  } catch (error) {
    // Event integration is optional infrastructure. A read-only or damaged
    // inbox must not prevent the terminal-first Agent workflow from starting.
    console.error('[DevStation] Agent event integration unavailable:', error)
    agentEventInbox?.stop()
    agentEventInbox = null
    eventBridge = undefined
  }
  const agentRuntime = new AgentRuntimeService({
    registry: agentRegistry,
    sessions: repositories.sessions,
    eventBridge
  })
  terminalManager = new TerminalManager({
    host: terminalHost,
    repositories,
    agentRuntime
  })
  terminalManager.registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('second-instance', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let e2eShutdownStarted = false
app.on('before-quit', (event) => {
  if (
    process.env['DEVSTATION_E2E'] === '1' &&
    process.env['DEVSTATION_E2E_KEEP_TERMINAL_HOST'] !== '1' &&
    terminalManager !== null &&
    !e2eShutdownStarted
  ) {
    event.preventDefault()
    e2eShutdownStarted = true
    void terminalManager.shutdownHost().finally(() => app.quit())
    return
  }
  terminalManager?.dispose()
  terminalManager = null
  agentEventInbox?.stop()
  agentEventInbox = null
  db?.close()
  db = null
})
