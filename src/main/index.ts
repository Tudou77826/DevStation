import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

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
    titleBarOverlay: process.platform === 'win32'
      ? { color: THEME_CHROME.dark.titleBar, symbolColor: THEME_CHROME.dark.symbol, height: 36 }
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

  // Open external links in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Renderer pushes the active theme here so the native window chrome
  // (background + caption buttons) follows the app theme.
  ipcMain.handle(
    'theme:update',
    (_event, theme: 'dark' | 'light') => {
      if (mainWindow !== null) applyWindowChrome(mainWindow, theme)
      return true
    }
  )

  // electron-vite dev server in dev, built file in production.
  if (process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Ensure single instance before any window logic.
void app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
