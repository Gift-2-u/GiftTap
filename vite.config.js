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
      // Works with standard Vite (rolldown-vite breaks shim export conditions)
      nodePolyfills({
        include: ['buffer', 'crypto', 'stream', 'util', 'process', 'vm'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
      }),
    ],
    optimizeDeps: {
      entries: ['index.html', 'src/main.jsx'],
      include: [
        'framer-motion',
        'buffer',
        'process',
        'bip39',
        'ed25519-hd-key',
        '@solana/web3.js',
        '@solana/wallet-adapter-base',
        '@solana/wallet-adapter-react',
        '@solana/wallet-adapter-react-ui',
        '@solana/wallet-adapter-phantom',
        '@solana/wallet-adapter-solflare',
        '@solana/wallet-adapter-coinbase',
        '@solana/wallet-adapter-ledger',
        '@solana/wallet-adapter-trust',
        '@solana/wallet-adapter-torus',
        '@solana/wallet-adapter-nightly',
        '@solana/wallet-adapter-mathwallet',
        '@solana/wallet-adapter-tokenpocket',
        '@solana/wallet-adapter-bitkeep',
        '@solana/wallet-adapter-clover',
        '@solana/wallet-adapter-coin98',
        '@solana/wallet-adapter-safepal',
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
    resolve: {
      alias: {
        'ed25519-hd-key': path.resolve(rootNM, 'ed25519-hd-key'),
        bip39: path.resolve(rootNM, 'bip39'),
        buffer: path.resolve(rootNM, 'buffer'),
      },
      dedupe: [
        'react',
        'react-dom',
        'buffer',
        'process',
        'bip39',
        'ed25519-hd-key',
        '@solana/web3.js',
      ],
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
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      chunkSizeWarningLimit: 2500,
    },
  };
});
