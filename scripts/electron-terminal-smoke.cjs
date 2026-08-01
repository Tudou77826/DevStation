const { app } = require('electron')
const { spawn } = require('node-pty')

const timeoutMs = 15000

function runPty(file, args, expected) {
  return new Promise((resolve, reject) => {
    let output = ''
    const terminal = spawn(file, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env
    })
    terminal.resize(100, 30)
    const timeout = setTimeout(() => {
      terminal.kill()
      reject(new Error(`PTY timed out. Output: ${output}`))
    }, timeoutMs)
    terminal.onData((data) => {
      output += data
    })
    terminal.onExit(({ exitCode }) => {
      clearTimeout(timeout)
      if (exitCode !== 0 || !output.includes(expected)) {
        reject(new Error(`PTY assertion failed (${exitCode}). Output: ${output}`))
      } else {
        resolve(output)
      }
    })
  })
}

app.whenReady().then(async () => {
  try {
    if (process.platform === 'win32') {
      const shell = process.env.COMSPEC || 'cmd.exe'
      await runPty(shell, ['/d', '/c', 'echo DEVSTATION_PTY_OK'], 'DEVSTATION_PTY_OK')
    } else {
      const shell = process.env.SHELL || '/bin/bash'
      await runPty(shell, ['-lc', 'printf DEVSTATION_PTY_OK'], 'DEVSTATION_PTY_OK')
    }
    console.log('Stage 0 terminal smoke passed: PTY I/O, resize, and clean exit.')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
