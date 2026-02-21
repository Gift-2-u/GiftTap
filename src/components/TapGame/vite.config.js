import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig(({ mode }) => {
  // Load env file from the current directory
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [
      react(),
      nodePolyfills({
        include: ['buffer', 'crypto', 'stream', 'util'],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
    define: {
      // This ensures the variable is available even if the automatic detection slips up
      'process.env.VITE_SOLANA_RPC_URL': JSON.stringify(env.VITE_SOLANA_RPC_URL)
    }
  }
})