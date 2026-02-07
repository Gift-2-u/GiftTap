import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // Add this
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Add this
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      // Direct alias in case the plugin needs extra help
      Buffer: 'buffer/',
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
    },
  },
  define: {
    // This provides a fallback for libraries looking for 'global'
    'global': 'globalThis',
  },
});