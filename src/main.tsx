import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/el-messiri/cyrillic-700.css'
import '@fontsource/el-messiri/cyrillic-400.css'
import '@fontsource/brygada-1918/cyrillic-400.css'
import '@fontsource/brygada-1918/cyrillic-700.css'
import { App } from './app/App'
import './styles/tokens.css'
import './styles/global.css'
import './pwa'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

async function start() {
  if (!window.CSS || !CSS.supports('display', 'grid') || !CSS.supports('--test', '0')) {
    await import('./compat/old-tv')
  }
  createRoot(rootElement!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
