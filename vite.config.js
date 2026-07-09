import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootNM = path.resolve(__dirname, 'node_modules');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const RPC_URL =
    env.VITE_SOLANA_RPC_URL ||
    'https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226';

  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        include: ['buffer', 'crypto', 'stream', 'util', 'process'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
      }),
    ],
    optimizeDeps: {
      // Real app only — do not scan nested TapGame copy
      entries: ['index.html', 'src/main.jsx'],
      include: [
        'framer-motion',
        'buffer',
        'bip39',
        'ed25519-hd-key',
      ],
    },
    resolve: {
      // Never pull packages from src/components/TapGame/node_modules
      alias: {
        'ed25519-hd-key': path.resolve(rootNM, 'ed25519-hd-key'),
        bip39: path.resolve(rootNM, 'bip39'),
        buffer: path.resolve(rootNM, 'buffer'),
      },
      dedupe: ['react', 'react-dom', 'buffer', 'bip39', 'ed25519-hd-key', '@solana/web3.js'],
    },
    server: {
      watch: {
        ignored: ['**/src/components/TapGame/**'],
      },
    },
    define: {
      global: 'globalThis',
      'import.meta.env.VITE_SOLANA_RPC_URL': JSON.stringify(RPC_URL),
    },
  };
});
