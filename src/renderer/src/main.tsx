import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './assets/main.css'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('DevStation root container #root not found')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
