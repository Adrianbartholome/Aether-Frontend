import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// STABLE V3 SETUP: No Tailwind plugin here. We rely on PostCSS.
export default defineConfig({
  plugins: [react()],
  base: '/titan/',
});