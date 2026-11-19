/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Sitio estático: `vite build` genera la carpeta dist/.
// Las cabeceras COOP/COEP (para Stockfish multihilo) se aplican con vercel.json en producción
// y aquí en el servidor de desarrollo y de vista previa.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
