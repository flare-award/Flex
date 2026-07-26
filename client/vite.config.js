import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For GitHub Pages project site, base should be /Flex/
// Set via VITE_BASE env or fallback to /Flex/ for production builds when not specified? We require explicit for safety.
// Default for dev is '/', for production we want /Flex/ if building for GH Pages.
// Workflow sets VITE_BASE=/Flex/
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
  },
  build: { outDir: 'dist', sourcemap: false },
});
