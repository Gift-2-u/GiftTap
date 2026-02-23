import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // THE HAMMER: If Vercel fails to provide the variable, we force it here.
  const RPC_URL = env.VITE_SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226";

  return {
    plugins: [
      react(),
      nodePolyfills({
        include: ['buffer', 'crypto', 'stream', 'util'],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
    define: {
      // This forces the build to replace the variable with the actual URL string
      'import.meta.env.VITE_SOLANA_RPC_URL': JSON.stringify(RPC_URL),
    },
  }
})