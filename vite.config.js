<<<<<<< HEAD
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
=======
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
    // ADD THIS SECTION: It stops Vite from hunting for missing TS files in framer-motion
    optimizeDeps: {
      include: ['framer-motion'],
    },
    define: {
      // This forces the build to replace the variable with the actual URL string
      'import.meta.env.VITE_SOLANA_RPC_URL': JSON.stringify(RPC_URL),
    },
  }
})
>>>>>>> cc230080b45158b62b4e722df27609d41b747029
