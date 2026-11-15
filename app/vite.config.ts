import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Fester Port: IndexedDB-Daten hängen am Origin (Host + Port).
// Ändert sich der Port, sieht der Browser eine leere Datenbank.
export default defineConfig({
  // Relativer Pfad, damit die App auch unter https://<user>.github.io/<repo>/ läuft
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true, host: 'localhost' },
  preview: { port: 5199, strictPort: true, host: 'localhost' },
  build: { chunkSizeWarningLimit: 1500 },
})
