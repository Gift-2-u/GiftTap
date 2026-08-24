import React, { useEffect, useMemo, useState } from 'react';
import {
  sendSolFromGameWallet,
  swapFromGameWallet,
  quoteJupiter,
} from './gameWalletActions';
import { hasLocksmith } from './locksmith';
import {
  SHARD_SWAP_CONFIG,
  getSwapAccess,
  quoteShardSwap,
  inventoryAfterSwap,
  inventoryAfterDurabilityTopUp,
  getDailySwapUsed,
  getSwapDurability,
  durabilityRemainingShards,
} from './shardSwap';
// SwapBadgeCard kept in repo — UI hidden (Locksmith-only swap path in game)
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID, getPlayerId } from './playerIdentity';

/**
 * Receive / Send / Swap / Shard sheets for the main-site game wallet.
 * UI matches GiftTap.jsx game wallet modals exactly.
 * All stay on gift2u.fun — no redirect into /play.
 */

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100002,
  },
  modalContent: {
    background: '#222',
    padding: '25px',
    borderRadius: '15px',
    width: '85%',
    maxWidth: '400px',
    border: '2px solid #ffd700',
    textAlign: 'center',
  },
  depositBox: {
    background: '#111',
    padding: '15px',
    borderRadius: '12px',
    marginTop: '15px',
    border: '1px solid #333',
  },
  addressRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '8px',
    background: '#000',
    padding: '10px',
    borderRadius: '8px',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.2rem',
    color: '#ffd700',
  },
};

const darkPanel = {
  ...styles.modalContent,
  background: '#131517',
  border: '1px solid #333',
  width: '90%',
  maxWidth: '360px',
  maxHeight: 'min(90dvh, 100%)',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
  touchAction: 'pan-y',
  boxSizing: 'border-box',
};

export default function GameWalletActionModals({
  action, // 'receive' | 'send' | 'swap' | 'shard' | null
  onClose,
  address,
  balances = {},
  onSuccess,
  inventory: inventoryProp = {},
  currentLevel = 0,
  maxUnlockedLevel = 4,
  playerId: playerIdProp,
}) {
  const [toAddr, setToAddr] = useState('');
  const [amount, setAmount] = useState('');
  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('G2U');
  const [outAmt, setOutAmt] = useState('');
  const [status, setStatus] = useState({
    show: false,
    loading: false,
    message: '',
    success: null,
    txid: null,
  });
  const [shardAmt, setShardAmt] = useState('');
  const [inventory, setInventory] = useState(inventoryProp || {});
  const [hasLocksmithNft, setHasLocksmithNft] = useState(false);
  const [shardBusy, setShardBusy] = useState(false);

  useEffect(() => {
    setInventory(inventoryProp || {});
  }, [inventoryProp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (action !== 'shard' || !address) {
        setHasLocksmithNft(false);
        return;
      }
      const ok = await hasLocksmith(address);
      if (!cancelled) setHasLocksmithNft(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [action, address]);

  const playerId = playerIdProp || getPlayerId() || '';
  const swapAccess = getSwapAccess({
    currentLevel,
    maxUnlockedLevel,
    inventory,
    hasLocksmithNft,
  });
  const shardQuote = quoteShardSwap(shardAmt, swapAccess, inventory);

  // Same fee model as GiftTap (base fee + 25% buffer + fixed project fee)
  const transactionCosts = useMemo(
    () => ({
      baseFeeWithBuffer: (800000 / 1e9) * 1.25,
      projectFee: 0.0005,
    }),
    [],
  );
  const isFeeLoaded = transactionCosts.baseFeeWithBuffer > 0;

  const balSol = Number(balances.sol) || 0;
  const balUsdc = Number(balances.usdc) || 0;
  const balGft = Number(balances.G2U) || 0;
  const balShards = Number(balances.G2Ushards) || 0;

  const netReceiveAmount = useMemo(() => {
    const amt = Number(amount) || 0;
    const fees =
      (transactionCosts.baseFeeWithBuffer || 0) +
      (transactionCosts.projectFee || 0);
    return amt > fees ? (amt - fees).toFixed(6) : '0.000000';
  }, [amount, transactionCosts]);

  const getSwapBalance = (token) => {
    if (token === 'SOL') return balSol.toFixed(4);
    if (token === 'USDC') return balUsdc.toFixed(2);
    if (token === 'G2U') return balGft.toFixed(4);
    return '0';
  };

  // Reset form state when switching / closing action
  useEffect(() => {
    setToAddr('');
    setAmount('');
    setOutAmt('');
    setShardAmt('');
    setFromToken('SOL');
    setToToken('G2U');
    setStatus({ show: false, loading: false, message: '', success: null, txid: null });
  }, [action]);

  // Jupiter quote — same as GiftTap
  useEffect(() => {
    if (action !== 'swap') return;
    if (!amount || parseFloat(amount) <= 0) {
      setOutAmt('');
      return;
    }
    const t = setTimeout(async () => {
      try {
        const q = await quoteJupiter({ fromToken, toToken, amount });
        setOutAmt(q);
      } catch {
        setOutAmt('');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [amount, fromToken, toToken, action]);

  if (!action) return null;

  const handleMaxWithdraw = () => {
    const projectFee = transactionCosts.projectFee || 0.0005;
    const networkBuffer = transactionCosts.baseFeeWithBuffer || 0.000025;
    const rentBuffer = 0.001;
    const safeMax = balSol - projectFee - networkBuffer - rentBuffer;
    if (safeMax > 0) {
      setAmount((Math.floor(safeMax * 100000) / 100000).toString());
    } else {
      setAmount('');
      setStatus({
        show: true,
        loading: false,
        message: 'Balance is too low to cover the 0.001 SOL transaction fee.',
        success: false,
        txid: null,
      });
    }
  };

  const runSend = async (e) => {
    if (e) e.preventDefault();
    if (!toAddr || !amount) return;
    setStatus({
      show: true,
      loading: true,
      message: 'Initiating withdrawal...',
      success: false,
      txid: null,
    });
    try {
      setStatus({
        show: true,
        loading: true,
        message: '🔗 Confirming withdrawal on Solana...',
        success: false,
        txid: null,
      });
      const { signature } = await sendSolFromGameWallet({
        toAddress: toAddr,
        amountSol: amount,
      });
      setStatus({
        show: true,
        loading: false,
        message: '✅ Withdrawal successful!',
        success: true,
        txid: signature,
      });
      setToAddr('');
      setAmount('');
      onSuccess?.();
      setTimeout(() => {
        setStatus({ show: false, loading: false, message: '', success: null, txid: null });
        onClose?.();
      }, 3000);
    } catch (err) {
      setStatus({
        show: true,
        loading: false,
        message: `❌ Error: ${err?.message || 'Send failed'}`,
        success: false,
        txid: null,
      });
    }
  };

  const runSwap = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setStatus({
      show: true,
      loading: true,
      message: 'Swapping…',
      success: false,
      txid: null,
    });
    try {
      const { signature } = await swapFromGameWallet({ fromToken, toToken, amount });
      setStatus({
        show: true,
        loading: false,
        message: '✅ Swap confirmed',
        success: true,
        txid: signature,
      });
      setAmount('');
      setOutAmt('');
      onSuccess?.();
      setTimeout(() => {
        setStatus({ show: false, loading: false, message: '', success: null, txid: null });
        onClose?.();
      }, 3000);
    } catch (e) {
      setStatus({
        show: true,
        loading: false,
        message: `❌ Error: ${e?.message || 'Swap failed'}`,
        success: false,
        txid: null,
      });
    }
  };

  const closeIfIdle = () => {
    if (!status.loading) onClose?.();
  };

  return (
    <>
      {/* Receive Pop-up — matches GiftTap */}
      {action === 'receive' && address ? (
        <div style={styles.modalOverlay} onClick={closeIfIdle}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ color: '#fff', margin: 0 }}>Receive Assets</h3>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '10px',
                borderRadius: '10px',
                display: 'inline-block',
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(address)}`}
                alt="Wallet QR Code"
                style={{ width: '150px', height: '150px' }}
              />
            </div>

            <div style={styles.depositBox}>
              <div style={{ fontSize: '12px', color: '#888', textAlign: 'left' }}>
                Your Wallet Address
              </div>
              <div style={styles.addressRow}>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#fff',
                    wordBreak: 'break-all',
                    marginRight: '10px',
                  }}
                >
                  {address}
                </span>
                <button
                  type="button"
                  style={styles.copyBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(address);
                    setStatus({
                      show: true,
                      loading: false,
                      message: 'Address copied!',
                      success: true,
                      txid: null,
                    });
                  }}
                >
                  ❐
                </button>
              </div>
            </div>

            <p style={{ fontSize: '10px', color: '#666', marginTop: '15px' }}>
              Only send Solana (SOL) or SPL tokens (like G2U) to this address.
            </p>
          </div>
        </div>
      ) : null}

      {/* Withdraw / Send Pop-up — matches GiftTap */}
      {action === 'send' ? (
        <div style={styles.modalOverlay} onClick={closeIfIdle}>
          <div style={darkPanel} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ color: '#fff', margin: 0 }}>Withdraw</h3>
              <button
                type="button"
                onClick={onClose}
                disabled={status.loading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ textAlign: 'left', marginBottom: '15px' }}>
              <label
                style={{
                  color: '#888',
                  fontSize: '12px',
                  display: 'block',
                  marginBottom: '5px',
                }}
              >
                Destination Address
              </label>
              <input
                type="text"
                placeholder="Enter Solana address"
                value={toAddr}
                onChange={(e) => setToAddr(e.target.value)}
                disabled={status.loading}
                style={{
                  width: '100%',
                  background: '#1c1e22',
                  border: '1px solid #333',
                  borderRadius: '12px',
                  padding: '12px',
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div
              style={{
                marginTop: '15px',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#888',
                }}
              >
                <span>Amount requested</span>
                <span>{(Number(amount) || 0).toFixed(4)} SOL</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#fbef43',
                  marginTop: '5px',
                }}
              >
                <span>Estimated Network Fee</span>
                <span>
                  - {transactionCosts.baseFeeWithBuffer?.toFixed(6) ?? '0.001'} SOL
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#fbef43',
                  marginTop: '5px',
                }}
              >
                <span>Project fee</span>
                <span>
                  - {(transactionCosts.projectFee || 0.0005).toFixed(4)} SOL
                </span>
              </div>
              <div
                style={{
                  borderTop: '1px solid #333',
                  marginTop: '10px',
                  paddingTop: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 'bold',
                }}
              >
                <span>You will receive</span>
                <span style={{ color: '#ffd700' }}>{netReceiveAmount} SOL</span>
              </div>
            </div>

            <div style={{ textAlign: 'left', marginBottom: '20px', marginTop: '15px' }}>
              <label
                style={{
                  color: '#888',
                  fontSize: '12px',
                  display: 'block',
                  marginBottom: '5px',
                }}
              >
                Amount (SOL)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={status.loading}
                  style={{
                    width: '100%',
                    background: '#1c1e22',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    padding: '12px',
                    color: '#fff',
                    boxSizing: 'border-box',
                  }}
                />
                <span
                  onClick={handleMaxWithdraw}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '12px',
                    color: '#ffd700',
                    fontSize: '12px',
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                >
                  {' '}
                  MAX
                </span>
              </div>
              <div style={{ color: '#555', fontSize: '10px', marginTop: '5px' }}>
                Available balance: {balSol.toFixed(4)} SOL
              </div>
            </div>

            <button
              type="button"
              disabled={
                !amount ||
                amount <= 0 ||
                !toAddr ||
                !isFeeLoaded ||
                status.loading
              }
              style={{
                width: '100%',
                background: '#fbef43',
                color: '#000',
                border: 'none',
                padding: '16px',
                borderRadius: '30px',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor:
                  amount > 0 && isFeeLoaded && !status.loading
                    ? 'pointer'
                    : 'not-allowed',
                opacity: amount > 0 && isFeeLoaded && !status.loading ? 1 : 0.5,
              }}
              onClick={runSend}
            >
              {status.loading
                ? 'Confirming…'
                : isFeeLoaded
                  ? 'Confirm Withdrawal'
                  : 'Loading Network Fees...'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Swap Pop-up — matches GiftTap */}
      {action === 'swap' ? (
        <div style={styles.modalOverlay} onClick={closeIfIdle}>
          <div style={darkPanel} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ color: '#fff', margin: 0 }}>Swap</h3>
              <button
                type="button"
                onClick={onClose}
                disabled={status.loading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: '#1c1e22',
                borderRadius: '16px',
                padding: '15px',
                textAlign: 'left',
                marginBottom: '5px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: '#888',
                  fontSize: '12px',
                }}
              >
                <span>You pay</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Balance: {getSwapBalance(fromToken)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const currentBal = parseFloat(getSwapBalance(fromToken)) || 0;
                      const maxAmount =
                        fromToken === 'SOL'
                          ? Math.max(0, currentBal - 0.005)
                          : currentBal;
                      setAmount(maxAmount > 0 ? maxAmount.toString() : '');
                    }}
                    style={{
                      background: 'rgba(255, 215, 0, 0.15)',
                      color: '#ffd700',
                      border: '1px solid rgba(255, 215, 0, 0.3)',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    MAX
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                }}
              >
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={status.loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '24px',
                    width: '50%',
                    outline: 'none',
                  }}
                />
                <select
                  value={fromToken}
                  onChange={(e) => {
                    setFromToken(e.target.value);
                    setAmount('');
                  }}
                  style={{
                    background: '#2a2d35',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  <option value="SOL">SOL</option>
                  <option value="USDC">USDC</option>
                  <option value="G2U">G2U</option>
                </select>
              </div>
            </div>

            <div
              style={{
                height: '30px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 2,
                position: 'relative',
                margin: '-15px 0',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const tempToken = fromToken;
                  setFromToken(toToken);
                  setToToken(tempToken);
                  setAmount('');
                }}
                style={{
                  background: '#131517',
                  border: '2px solid #333',
                  borderRadius: '50%',
                  padding: '0',
                  color: '#fbef43',
                  cursor: 'pointer',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                ↓↑
              </button>
            </div>

            <div
              style={{
                background: '#1c1e22',
                borderRadius: '16px',
                padding: '15px',
                textAlign: 'left',
                marginTop: '5px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#888',
                  fontSize: '12px',
                }}
              >
                <span>You receive (Estimated)</span>
                <span>Balance: {getSwapBalance(toToken)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                }}
              >
                <input
                  type="number"
                  placeholder="0.00"
                  value={outAmt}
                  readOnly
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '24px',
                    width: '50%',
                    outline: 'none',
                    opacity: 0.7,
                  }}
                />
                <select
                  value={toToken}
                  onChange={(e) => {
                    setToToken(e.target.value);
                    setOutAmt('');
                  }}
                  style={{
                    background: '#2a2d35',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  <option value="SOL">SOL</option>
                  <option value="USDC">USDC</option>
                  <option value="G2U">G2U</option>
                </select>
              </div>
            </div>

            <p
              style={{
                fontSize: '12px',
                color: '#888',
                marginTop: '20px',
                textAlign: 'center',
              }}
            >
              Powered by Jupiter Aggregator
            </p>

            <button
              type="button"
              style={{
                width: '100%',
                background: '#fbef43',
                color: '#000',
                border: 'none',
                padding: '16px',
                borderRadius: '30px',
                fontWeight: 'bold',
                fontSize: '16px',
                marginTop: '20px',
                cursor: amount > 0 && !status.loading ? 'pointer' : 'not-allowed',
                opacity: amount > 0 && !status.loading ? 1 : 0.5,
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
              disabled={status.loading || !(amount > 0)}
              onClick={runSwap}
            >
              {status.loading ? 'Swapping…' : 'Execute Swap'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Shard Swap Pop-up — matches GiftTap */}
      {action === 'shard' ? (
        <div
          style={{
            ...styles.modalOverlay,
            padding:
              'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
          onClick={closeIfIdle}
        >
          <div style={darkPanel} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ color: '#fff', margin: 0 }}>Shard Swap</h3>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: '#1c1e22',
                borderRadius: '16px',
                padding: '15px',
                textAlign: 'left',
                marginBottom: '5px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#888',
                  fontSize: '12px',
                }}
              >
                <span>You pay</span>
                <span>Balance: {balShards.toLocaleString() || '0'}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                }}
              >
                <input
                  type="number"
                  placeholder="0"
                  value={shardAmt}
                  onChange={(e) => setShardAmt(e.target.value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '24px',
                    width: '60%',
                    outline: 'none',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#fff',
                    fontWeight: 'bold',
                  }}
                >
                  <span>G2Ushards</span>
                </div>
              </div>
            </div>

            <div
              style={{
                height: '30px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 2,
                position: 'relative',
                margin: '-15px 0',
              }}
            >
              <div
                style={{
                  background: '#131517',
                  border: '2px solid #333',
                  borderRadius: '50%',
                  padding: '0',
                  color: '#fbef43',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                ↓
              </div>
            </div>

            <div
              style={{
                background: '#1c1e22',
                borderRadius: '16px',
                padding: '15px',
                textAlign: 'left',
                marginTop: '5px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#888',
                  fontSize: '12px',
                }}
              >
                <span>You receive</span>
                <span>Balance: {getSwapBalance('G2U')}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                }}
              >
                <input
                  type="number"
                  placeholder="0.00"
                  value={shardQuote.ok ? shardQuote.gftOut : ''}
                  readOnly
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '24px',
                    width: '60%',
                    outline: 'none',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#fff',
                    fontWeight: 'bold',
                  }}
                >
                  <span>G2U</span>
                </div>
              </div>
            </div>

            {swapAccess.allowed && (
              <div
                style={{
                  background:
                    swapAccess.tier === 'locksmith'
                      ? 'rgba(153,69,255,0.15)'
                      : 'rgba(74,222,128,0.1)',
                  border: `1px solid ${
                    swapAccess.tier === 'locksmith' ? '#9945FF' : '#4ade80'
                  }`,
                  borderRadius: 12,
                  padding: '10px 12px',
                  marginBottom: 12,
                  fontSize: 12,
                  color: '#ccc',
                  textAlign: 'left',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: 4 }}>
                  {swapAccess.tier === 'locksmith' ? 'GiftLocksmith' : 'Swap active'}
                  {hasLocksmithNft ? ' 🔑' : ''}
                </div>
                Fee {(swapAccess.feeBps / 100).toFixed(1)}% in G2U · Min{' '}
                {swapAccess.minShards.toLocaleString()} shards
                <br />
                Today: {getDailySwapUsed(inventory).toLocaleString()} /{' '}
                {swapAccess.dailyCapShards.toLocaleString()} shards
                <br />
                Rate: {SHARD_SWAP_CONFIG.shardsPerGft.toLocaleString()} shards → 1 G2U (provisional)
              </div>
            )}

            {shardQuote.ok && (
              <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                Gross {shardQuote.gftGross} G2U · fee {shardQuote.feeGft} G2U · you get {shardQuote.gftOut} G2U
              </p>
            )}
            {!shardQuote.ok && shardAmt && (
              <p style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{shardQuote.error}</p>
            )}

            {/* Swap Access Card UI hidden — keep SwapBadgeCard.jsx / shardSwap.js for later */}
            {!hasLocksmithNft && !swapAccess.allowed && (
              <p
                style={{
                  fontSize: '11px',
                  color: '#888',
                  marginTop: '12px',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                Shard → G2U swap needs GiftLocksmith.
              </p>
            )}

            <button
              type="button"
              disabled={
                !swapAccess.allowed ||
                !shardQuote.ok ||
                shardBusy ||
                balShards < Number(shardAmt) ||
                !playerId
              }
              onClick={async () => {
                const amt = Number(shardAmt);
                const access = getSwapAccess({
                  currentLevel,
                  maxUnlockedLevel,
                  inventory,
                  hasLocksmithNft,
                });
                const quote = quoteShardSwap(amt, access, inventory);
                if (!quote.ok) {
                  setStatus({
                    show: true,
                    loading: false,
                    message: quote.error,
                    success: false,
                    txid: null,
                  });
                  return;
                }
                setShardBusy(true);
                try {
                  const newShardBal = Math.round((balShards - amt) * 1000) / 1000;
                  const newGft =
                    Math.round((balGft + quote.gftOut) * 1e6) / 1e6;
                  const nextInv = inventoryAfterSwap(inventory, amt, quote.feeGft, {
                    isFreeTier: access.tier === 'free',
                  });
                  const { error } = await supabase
                    .from('players')
                    .update({
                      shard_balance: newShardBal,
                      gft_token_balance: newGft,
                      inventory: nextInv,
                      last_updated: new Date().toISOString(),
                    })
                    .eq(DB_PLAYER_ID, String(playerId));
                  if (error) throw error;
                  setInventory(nextInv);
                  setShardAmt('');
                  onSuccess?.();
                  setStatus({
                    show: true,
                    loading: false,
                    message: `✅ ${quote.gftOut} G2U credited (fee ${quote.feeGft} G2U, ${access.label})`,
                    success: true,
                    txid: null,
                  });
                } catch (e) {
                  setStatus({
                    show: true,
                    loading: false,
                    message: e?.message || 'Swap failed',
                    success: false,
                    txid: null,
                  });
                } finally {
                  setShardBusy(false);
                }
              }}
              style={{
                width: '100%',
                background:
                  swapAccess.allowed && shardQuote.ok
                    ? 'linear-gradient(90deg, #9945FF, #14F195)'
                    : '#333',
                color: swapAccess.allowed && shardQuote.ok ? '#000' : '#888',
                border: 'none',
                padding: '16px',
                borderRadius: '30px',
                fontWeight: 'bold',
                fontSize: '16px',
                marginTop: '12px',
                cursor:
                  swapAccess.allowed && shardQuote.ok ? 'pointer' : 'not-allowed',
              }}
            >
              {shardBusy
                ? 'Swapping…'
                : !swapAccess.allowed
                  ? 'Swap locked'
                  : 'Swap G2Ushards → G2U'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Solflare-style floating toast — matches GiftTap */}
      {status.show && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 100003,
            minWidth: '320px',
            padding: '16px 20px',
            background: '#141518',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            borderLeft: `4px solid ${
              status.loading
                ? '#3b82f6'
                : status.success
                  ? '#10b981'
                  : '#ef4444'
            }`,
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            transition: 'opacity 0.3s ease-in-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {status.loading && (
              <span style={{ color: '#3b82f6', fontSize: '18px' }}>⏳</span>
            )}
            {status.success && (
              <span style={{ color: '#10b981', fontSize: '18px' }}>✅</span>
            )}
            {!status.loading && !status.success && (
              <span style={{ color: '#ef4444', fontSize: '18px' }}>❌</span>
            )}
            <div style={{ fontWeight: '600', fontSize: '15px' }}>
              {status.message}
            </div>
          </div>
          {status.txid && status.success && (
            <a
              href={`https://solscan.io/tx/${status.txid}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#9ca3af',
                fontSize: '13px',
                textDecoration: 'none',
                marginLeft: '28px',
              }}
            >
              View on Solscan ↗
            </a>
          )}
        </div>
      )}
    </>
  );
}
