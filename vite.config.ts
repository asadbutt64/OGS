import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Crucial for Electron to load files via file:// protocol
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
