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
import { Analytics } from '@vercel/analytics/next';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
