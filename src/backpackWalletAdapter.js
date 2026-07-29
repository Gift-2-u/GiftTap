/**
 * Backpack adapter:
 * - Desktop / in-app browser: window.backpack (Installed)
 * - Mobile: Loadable → open site inside Backpack via browse UL
 * - Local/private hosts: refuse broken deep-links (they send users to "download")
 */
import {
  BaseMessageSignerWalletAdapter,
  scopePollingDetectionStrategy,
  WalletAccountError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSendTransactionError,
  WalletSignMessageError,
  WalletSignTransactionError,
  isVersionedTransaction,
} from '@solana/wallet-adapter-base';
import { PublicKey } from '@solana/web3.js';

export const BackpackWalletName = 'Backpack';

/** Official-looking Backpack-style mark (not a red error square). */
const BACKPACK_ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDggMTA4IiBmaWxsPSJub25lIj48cmVjdCB3aWR0aD0iMTA4IiBoZWlnaHQ9IjEwOCIgcng9IjI0IiBmaWxsPSIjMEYwRjBGIi8+PHBhdGggZD0iTTMwIDM4YzAtNi42MjcgNS4zNzMtMTIgMTItMTJoMjRjNi42MjcgMCAxMiA1LjM3MyAxMiAxMnY4SDMwdi04eiIgZmlsbD0iI0UzM0UzRiIvPjxwYXRoIGQ9Ik0yOCA0OGg1MnYyOGMwIDYuNjI3LTUuMzczIDEyLTEyIDEySDQwYy02LjYyNyAwLTEyLTUuMzczLTEyLTEyVjQ4eiIgZmlsbD0iI0UzM0UzRiIvPjxwYXRoIGQ9Ik00OCA1OGgxMnYxOEg0OFY1OHoiIGZpbGw9IiMwRjBGMEYiLz48L3N2Zz4=';

function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

/** Hosts where backpack in-app browser / UL often fails and falls back to "download". */
export function isLocalOrPrivateHost(hostname = '') {
  const h = (hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]') {
    return true;
  }
  // Private LAN
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

export function getBackpackProvider() {
  if (typeof window === 'undefined') return null;
  const w = window;
  if (w.backpack?.isBackpack) return w.backpack;
  if (w.backpack?.solana?.isBackpack) return w.backpack.solana;
  if (w.backpack?.solana) return w.backpack.solana;
  if (w.xnft?.solana) return w.xnft.solana;
  // Some in-app builds expose under solana with isBackpack
  if (w.solana?.isBackpack) return w.solana;
  return null;
}

function openBackpackBrowse(targetUrl, refUrl) {
  const encoded = encodeURIComponent(targetUrl);
  const ref = encodeURIComponent(refUrl);
  const httpsUl = `https://backpack.app/ul/v1/browse/${encoded}?ref=${ref}`;

  if (isAndroid()) {
    // Prefer Android intent so the installed app is forced over the website
    const intent =
      `intent://backpack.app/ul/v1/browse/${encoded}?ref=${ref}` +
      `#Intent;scheme=https;package=app.backpack.mobile;S.browser_fallback_url=${encodeURIComponent(httpsUl)};end`;
    window.location.href = intent;
    return;
  }

  window.location.href = httpsUl;
}

export class BackpackWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = BackpackWalletName;
  url = 'https://backpack.app/download';
  icon = BACKPACK_ICON;
  supportedTransactionVersions = new Set(['legacy', 0]);

  _connecting = false;
  _wallet = null;
  _publicKey = null;
  _readyState =
    typeof window === 'undefined' || typeof document === 'undefined'
      ? WalletReadyState.Unsupported
      : WalletReadyState.NotDetected;

  constructor() {
    super();
    if (this._readyState === WalletReadyState.Unsupported) return;

    // If already inside Backpack (or extension), mark Installed immediately
    if (getBackpackProvider()) {
      this._readyState = WalletReadyState.Installed;
    } else if (isMobileUserAgent()) {
      // Mobile outside wallet browser: user can tap to open in-app browser
      this._readyState = WalletReadyState.Loadable;
    }

    scopePollingDetectionStrategy(() => {
      if (getBackpackProvider()) {
        this._readyState = WalletReadyState.Installed;
        this.emit('readyStateChange', this._readyState);
        return true;
      }
      return false;
    });
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get readyState() {
    return this._readyState;
  }

  async autoConnect() {
    // Only when actually injected — never auto deep-link
    if (this.readyState === WalletReadyState.Installed) {
      await this.connect();
    }
  }

  async connect() {
    try {
      if (this.connected || this.connecting) return;

      // Prefer live provider if it appeared (e.g. after opening in-app browser)
      const live = getBackpackProvider();
      if (live) {
        this._readyState = WalletReadyState.Installed;
        this.emit('readyStateChange', this._readyState);
      }

      if (this.readyState === WalletReadyState.Loadable && !live) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        if (isLocalOrPrivateHost(host)) {
          const msg =
            'Backpack cannot open localhost / private IPs in its in-app browser. ' +
            'Use a public HTTPS URL (ngrok / deploy), OR open the site from Backpack’s built-in browser, ' +
            'OR on Android use “Mobile Wallet Adapter”.';
          throw new WalletConnectionError(msg);
        }
        if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && host !== 'localhost') {
          // Some wallets require HTTPS for browse UL
          console.warn('[Backpack] Prefer HTTPS for mobile deep links');
        }
        openBackpackBrowse(window.location.href, window.location.origin);
        // Do not throw — user is leaving the page. Selection stays until they return connected.
        return;
      }

      if (this.readyState !== WalletReadyState.Installed && !live) {
        throw new WalletNotReadyError();
      }

      this._connecting = true;
      const wallet = live || getBackpackProvider();
      if (!wallet) throw new WalletNotReadyError();

      try {
        if (!wallet.isConnected) {
          await wallet.connect();
        }
      } catch (error) {
        throw new WalletConnectionError(error?.message || 'Backpack connection rejected', error);
      }

      if (!wallet.publicKey) throw new WalletAccountError();

      let publicKey;
      try {
        publicKey =
          wallet.publicKey instanceof PublicKey
            ? wallet.publicKey
            : new PublicKey(wallet.publicKey.toBytes?.() ?? wallet.publicKey);
      } catch (error) {
        throw new WalletPublicKeyError(error?.message, error);
      }

      wallet.on?.('disconnect', this._disconnected);
      wallet.on?.('accountChanged', this._accountChanged);

      this._wallet = wallet;
      this._publicKey = publicKey;
      this.emit('connect', publicKey);
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect() {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off?.('disconnect', this._disconnected);
      wallet.off?.('accountChanged', this._accountChanged);
      this._wallet = null;
      this._publicKey = null;
      try {
        await wallet.disconnect?.();
      } catch (error) {
        this.emit('error', new WalletDisconnectionError(error?.message, error));
      }
    }
    this.emit('disconnect');
  }

  async sendTransaction(transaction, connection, options = {}) {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        const { signers, ...sendOptions } = options;
        if (isVersionedTransaction(transaction)) {
          signers?.length && transaction.sign(signers);
        } else {
          transaction = await this.prepareTransaction(transaction, connection, sendOptions);
          signers?.length && transaction.partialSign(...signers);
        }
        sendOptions.preflightCommitment =
          sendOptions.preflightCommitment || connection.commitment;
        if (wallet.signAndSendTransaction) {
          const { signature } = await wallet.signAndSendTransaction(transaction, sendOptions);
          return signature;
        }
        const signed = await wallet.signTransaction(transaction);
        return await connection.sendRawTransaction(signed.serialize(), sendOptions);
      } catch (error) {
        if (error instanceof WalletError) throw error;
        throw new WalletSendTransactionError(error?.message, error);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async signTransaction(transaction) {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        return (await wallet.signTransaction(transaction)) || transaction;
      } catch (error) {
        throw new WalletSignTransactionError(error?.message, error);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async signAllTransactions(transactions) {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        return (await wallet.signAllTransactions(transactions)) || transactions;
      } catch (error) {
        throw new WalletSignTransactionError(error?.message, error);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async signMessage(message) {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        const result = await wallet.signMessage(message);
        return result?.signature ?? result;
      } catch (error) {
        throw new WalletSignMessageError(error?.message, error);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  _disconnected = () => {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off?.('disconnect', this._disconnected);
      wallet.off?.('accountChanged', this._accountChanged);
      this._wallet = null;
      this._publicKey = null;
      this.emit('error', new WalletDisconnectedError());
      this.emit('disconnect');
    }
  };

  _accountChanged = (newPublicKey) => {
    const publicKey = this._publicKey;
    if (!publicKey || !newPublicKey) return;
    try {
      newPublicKey =
        newPublicKey instanceof PublicKey
          ? newPublicKey
          : new PublicKey(newPublicKey.toBytes?.() ?? newPublicKey);
    } catch (error) {
      this.emit('error', new WalletPublicKeyError(error?.message, error));
      return;
    }
    if (publicKey.equals(newPublicKey)) return;
    this._publicKey = newPublicKey;
    this.emit('connect', newPublicKey);
  };
}
