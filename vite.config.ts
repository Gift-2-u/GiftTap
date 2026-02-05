import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],

  // Add this to help Vite handle common Solana dependency issues
  optimizeDeps: {
    include: ['buffer'],
  },

  server: {
    // ESSENTIAL for WSL: This lets your Windows browser see the Linux port
    host: '0.0.0.0', 
    port: 5173,
    watch: {
      usePolling: true, // Needed if you edit files on Windows and run on Linux
    },
  },
  resolve: {
    alias: {
      // Helps Solana libraries resolve older node dependencies
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
    },
  },
  define: {
    'process.env': {},
  },
});