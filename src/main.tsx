import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AdminConsole from './AdminConsole.tsx'

function detectMode() {
  return window.location.hash.startsWith('#/admin') ? 'admin' : 'app'
}

function Root() {
  const [mode, setMode] = useState<'app' | 'admin'>(() => detectMode())

  useEffect(() => {
    const onHashChange = () => setMode(detectMode())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return mode === 'admin' ? <AdminConsole /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
