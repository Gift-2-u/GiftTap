/**
 * Backpack wallet adapter with desktop inject + mobile browse deep-link.
 * Mirrors Phantom/Solflare: on phone without inject, open the site inside Backpack.
 *
 * Browse UL: https://backpack.app/ul/v1/browse/<url>?ref=<ref>
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

function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

function getBackpackProvider() {
  if (typeof window === 'undefined') return null;
  // Wallet Standard / extension inject
  if (window.backpack?.isBackpack) return window.backpack;
  if (window.backpack?.solana?.isBackpack) return window.backpack.solana;
  // Some builds expose under xnft / solana
  if (window.xnft?.solana) return window.xnft.solana;
  return null;
}

export class BackpackWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = BackpackWalletName;
  url = 'https://backpack.app';
  icon =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTA4IiBoZWlnaHQ9IjEwOCIgdmlld0JveD0iMCAwIDEwOCAxMDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwOCIgaGVpZ2h0PSIxMDgiIHJ4PSIyNCIgZmlsbD0iIzE0MTUxOSIvPjxwYXRoIGQ9Ik0zMiAzMmg0NHY0NEgzMnoiIGZpbGw9IiNFMzNDNTQiLz48cGF0aCBkPSJNNDQgNDRoMjB2MjBINDR6IiBmaWxsPSIjMTQxNTE5Ii8+PC9zdmc+';
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

    // Phone browser without inject → Loadable (deep-link into Backpack in-app browser)
    if (isMobileUserAgent() && !getBackpackProvider()) {
      this._readyState = WalletReadyState.Loadable;
    }

    scopePollingDetectionStrategy(() => {
      const provider = getBackpackProvider();
      if (provider) {
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
    // Don't auto deep-link without user tap
    if (this.readyState === WalletReadyState.Installed) {
      await this.connect();
    }
  }

  async connect() {
    try {
      if (this.connected || this.connecting) return;

      // Mobile: open current page inside Backpack's in-app browser
      if (this.readyState === WalletReadyState.Loadable) {
        const url = encodeURIComponent(window.location.href);
        const ref = encodeURIComponent(window.location.origin);
        window.location.href = `https://backpack.app/ul/v1/browse/${url}?ref=${ref}`;
        return;
      }

      if (this.readyState !== WalletReadyState.Installed) {
        throw new WalletNotReadyError();
      }

      this._connecting = true;
      const wallet = getBackpackProvider();
      if (!wallet) throw new WalletNotReadyError();

      try {
        if (!wallet.isConnected) {
          await wallet.connect();
        }
      } catch (error) {
        throw new WalletConnectionError(error?.message, error);
      }

      if (!wallet.publicKey) throw new WalletAccountError();

      let publicKey;
      try {
        publicKey = new PublicKey(wallet.publicKey.toBytes());
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
        const { signature } = await wallet.signAndSendTransaction(transaction, sendOptions);
        return signature;
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
        const { signature } = await wallet.signMessage(message);
        return signature;
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
      newPublicKey = new PublicKey(newPublicKey.toBytes?.() ?? newPublicKey);
    } catch (error) {
      this.emit('error', new WalletPublicKeyError(error?.message, error));
      return;
    }
    if (publicKey.equals(newPublicKey)) return;
    this._publicKey = newPublicKey;
    this.emit('connect', newPublicKey);
  };
}
