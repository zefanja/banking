/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Erzeugt beim Build den Service Worker (sw.js) aus der Vorlage im App-Ordner.
 * Er bekommt die Liste aller Build- und public-Dateien, damit die App komplett offline startet.
 */
function serviceWorker(): Plugin {
  const publicFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? publicFiles(p) : [relative('public', p).split('\\').join('/')]
    })

  return {
    name: 'haushaltsbuch-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['./', ...Object.keys(bundle), ...publicFiles('public')]
        .filter((f) => !f.endsWith('.map'))
        .map((f) => (f === './' ? f : './' + f))
      const buildId = Date.now().toString(36)
      const source = readFileSync('sw.js', 'utf8')
        .replace('__BUILD_ID__', buildId)
        .replace('__PRECACHE__', JSON.stringify(files, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Fester Port: IndexedDB-Daten hängen am Origin (Host + Port).
// Ändert sich der Port, sieht der Browser eine leere Datenbank.
export default defineConfig({
  // Relativer Pfad, damit die App auch unter https://<user>.github.io/<repo>/ läuft
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: { port: 5199, strictPort: true, host: 'localhost' },
  preview: { port: 5199, strictPort: true, host: 'localhost' },
  build: { chunkSizeWarningLimit: 1500 },
})
