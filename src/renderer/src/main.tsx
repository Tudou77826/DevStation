import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './assets/main.css'
import '@xterm/xterm/css/xterm.css'
// Importing the theme store applies the saved theme on first paint and wires
// the OS-theme listener. Import for its side effects before the app renders.
import './store/theme'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('DevStation root container #root not found')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
