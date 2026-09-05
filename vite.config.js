import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootNM = path.resolve(__dirname, 'node_modules');

/** Stamp a unique build id into the JS bundle + /version.json for UpdatePrompt. */
function gift2uVersionPlugin(buildId, { production }) {
  const versionPath = path.resolve(__dirname, 'public/version.json');

  function buildPayload() {
    let prev = {};
    try {
      prev = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    } catch {
      /* first run */
    }
    return {
      v: buildId,
      title: prev.title || 'New game update',
      message:
        prev.message ||
        'A new version of GiftTap is ready. Tap Refresh to load it — no need to close the app.',
      force: !!prev.force,
    };
  }

  return {
    name: 'gift2u-version',
    buildStart() {
      if (!production) return;
      // Keep public/ in sync so the copy into dist matches the baked JS id
      try {
        const payload = buildPayload();
        fs.writeFileSync(versionPath, `${JSON.stringify(payload, null, 2)}\n`);
      } catch (e) {
        console.warn('[gift2u-version] could not write public/version.json', e?.message || e);
      }
    },
    writeBundle(options) {
      if (!production) return;
      const outDir = options.dir || path.resolve(__dirname, 'dist');
      try {
        const payload = buildPayload();
        fs.writeFileSync(
          path.join(outDir, 'version.json'),
          `${JSON.stringify(payload, null, 2)}\n`,
        );
        console.log(`[gift2u-version] wrote version.json v=${buildId}`);
      } catch (e) {
        console.warn('[gift2u-version] could not write dist/version.json', e?.message || e);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const RPC_URL =
    env.VITE_SOLANA_RPC_URL ||
    'https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226';
  const buildId =
    mode === 'production'
      ? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      : 'dev';

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
      gift2uVersionPlugin(buildId, { production: mode === 'production' }),
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
      'import.meta.env.VITE_GIFT2U_BUILD_ID': JSON.stringify(buildId),
    },
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      chunkSizeWarningLimit: 2500,
    },
  };
});
