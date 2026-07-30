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
  // Clear sticky Select Wallet state (Base/Coinbase/Connect stuck)
  try {
    ['walletName', 'gift2u_solana_wallet', 'walletAdapter', 'SolanaWalletName'].forEach((k) => {
      localStorage.removeItem(k);
    });
  } catch (_) {}
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

// Mobile Wallet Adapter (Android): Select Wallet → Mobile Wallet Adapter → Backpack/Phantom/etc.
// Must run once before the React tree mounts.
try {
  const origin = window.location?.origin || 'https://gift2u.fun';
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
} catch (e) {
  console.warn('[MWA]', e);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
