import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Helius RPC fallback for token infrastructure
  const RPC_URL = env.VITE_SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226";

  return {
    plugins: [
      react(),
      tailwindcss(), // Keeps your main website styling intact
      nodePolyfills({
        include: ['buffer', 'crypto', 'stream', 'util'],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
    optimizeDeps: {
      // Stops Vite from hunting for missing TS files in framer-motion during tapping game play
      include: ['framer-motion'],
    },
    resolve: {
      alias: {
        Buffer: 'buffer/',
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
      },
    },
    define: {
      'global': 'globalThis',
      // Forces the build to replace the variable with the actual URL string securely
      'import.meta.env.VITE_SOLANA_RPC_URL': JSON.stringify(RPC_URL),
    },
  };
});