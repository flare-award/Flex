import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When deploying to GitHub Pages project page (username.github.io/Flex), set
//   VITE_BASE=/Flex/
// For custom domain, root deploy, or Glitch static serving leave unset.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/socket.io': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
