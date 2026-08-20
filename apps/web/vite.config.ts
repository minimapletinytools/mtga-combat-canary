import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the built app also works from file:// inside Electron.
  base: './',
  plugins: [react()],
});
