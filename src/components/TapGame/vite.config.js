import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    // This magically fixes Buffer, Crypto, and Stream errors for Web3 apps
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util'], 
      globals: {
        Buffer: true, 
        global: true,
        process: true,
      },
    }),
  ],
})