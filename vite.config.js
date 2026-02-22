import { defineConfig, loadEnv } from 'vite' // Added loadEnv here!
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig(({ mode }) => {
  // This correctly loads your variables without crashing
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      nodePolyfills({
        include: ['buffer', 'crypto', 'stream', 'util'],
        globals: {
          Buffer: true, 
          global: true,
          process: true,
        },
      }),
    ],
  }
})