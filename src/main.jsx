// Polyfills MUST load before Solana / bip39 / ed25519-hd-key
import { Buffer } from 'buffer';
import process from 'process';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window;
  window.process = process;
  if (!window.process.version) window.process.version = 'v18.0.0';
  if (!window.process.versions) window.process.versions = { node: '18.0.0' };
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

// Wallet Standard MWA — only registers on HTTPS secure contexts (not plain http://LAN)
let mwaRegistered = false;
function initMobileWalletAdapter() {
  if (typeof window === 'undefined' || mwaRegistered) return;
  if (!window.isSecureContext) {
    console.warn(
      '[MWA] Skipped: page is not a secure context (need https://).',
      'Open https://gift2u.fun on the phone — http://localhost / http://192.168.x.x will not register MWA.',
    );
    return;
  }
  try {
    const origin = window.location.origin || 'https://gift2u.fun';
    registerMwa({
      appIdentity: {
        name: 'Gift2U',
        uri: origin,
        icon: '/Gift2u_logo.png',
      },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ['solana:mainnet', 'solana:devnet'],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });
    mwaRegistered = true;
    console.log('[MWA] registered via Wallet Standard');
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
