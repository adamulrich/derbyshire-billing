import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { parseReady } from './lib/parse'
import './styles.css'
import 'leaflet/dist/leaflet.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App parseReady={parseReady} /></StrictMode>,
)
