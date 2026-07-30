// Polyfills MUST load before Solana / bip39 / ed25519-hd-key
import { Buffer } from 'buffer';
import process from 'process';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window;
  window.process = process;
  if (!window.process.version) {
    window.process.version = 'v18.0.0';
  }
  if (!window.process.versions) {
    window.process.versions = { node: '18.0.0' };
  }
}
globalThis.Buffer = Buffer;
globalThis.process = process;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile';
import './index.css';
import App from './App.jsx';

// Doc path: register MWA once via Wallet Standard (client only, before React mounts)
let mwaRegistered = false;
function initMobileWalletAdapter() {
  if (typeof window === 'undefined' || mwaRegistered) return;
  try {
    registerMwa({
      appIdentity: {
        name: 'Gift2U',
        uri: 'https://gift2u.fun',
        icon: '/Gift2u_logo.png',
      },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ['solana:mainnet', 'solana:devnet'],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });
    mwaRegistered = true;
  } catch (e) {
    console.warn('[MWA] registerMwa failed:', e);
  }
}
initMobileWalletAdapter();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
