import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ToastProvider } from './components/ui'
import { requestPersistence } from './lib/db'
import { applyTheme } from './lib/theme'

requestPersistence()
applyTheme()

// iOS: Ein Tipp außerhalb eines Eingabefelds schließt die Tastatur nicht von selbst.
// Deshalb das Feld aktiv verlassen, damit Beträge übernommen werden, bevor der Button-Klick ankommt.
document.addEventListener(
  'touchstart',
  (e) => {
    const active = document.activeElement
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return
    const target = e.target as Element | null
    if (target?.closest('input, textarea, select, label')) return
    active.blur()
  },
  { passive: true, capture: true },
)

// Service Worker für Offline-Start und Installation als App (nur im Build, nicht im Dev-Server)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker nicht registriert:', e))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
