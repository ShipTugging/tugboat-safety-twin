import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // V2 shares the adjacent Vision generator's mask pass.
  resolve: { dedupe: ['three', 'react', 'react-dom'] },
  server: {
    port: 5173,
    host: true,
  },
});
