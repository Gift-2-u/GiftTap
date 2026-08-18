/**
 * In-game P2P weekly badge market.
 * Sell from backpack · buy with SOL now · G2U token after launch · 5% treasury.
 * Not G2Ushards.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { keypairFromMnemonic } from './solanaWallet';
import { BADGE_TIERS, badgeCatalogForBackpack, getBadgeCounts } from './weeklyBadges';
import {
  SHARD_BADGE,
  SHARD_BADGE_MARKET_TIER,
  getFreeShardBadgeCount,
  shardBadgeCatalogEntry,
} from './shardBadge';
import {
  hasSecureSession,
  ensureSecureSession,
  secureBadgeMarketBrowse,
  secureBadgeMarketList,
  secureBadgeMarketCancel,
  secureBadgeMarketBuy,
  secureBadgeMarketMyListings,
} from './secureApi';
import { RPC_URL } from './rpc';

const FEE_BPS = 500; // 5%
const TREASURY_SOL = '8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm';

function feeSplit(gross) {
  const g = Math.max(0, Number(gross) || 0);
  const fee = Math.round(g * FEE_BPS) / 10000;
  return { fee, net: Math.max(0, g - fee), gross: g };
}

export default function BadgeMarket({
  inventory = {},
  balance = 0,
  setBalance,
  setStats,
  setLocalInventory,
  decryptedPhrase,
  playerWallet,
  onStatus,
}) {
  const [tab, setTab] = useState('market'); // market | sell | mine
  const [listings, setListings] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Sell form
  const [sellTier, setSellTier] = useState('bronze');
  const [sellQty, setSellQty] = useState(1);
  const [sellCurrency, setSellCurrency] = useState('sol');
  const [sellPrice, setSellPrice] = useState('0.01');

  const counts = getBadgeCounts(inventory);
  const freeShard = getFreeShardBadgeCount(inventory);
  const marketCatalog = [
    ...badgeCatalogForBackpack(),
    {
      ...shardBadgeCatalogEntry(),
      tier: SHARD_BADGE_MARKET_TIER,
      free: freeShard,
    },
  ];
  const freeForTier = (tier) => {
    if (tier === SHARD_BADGE_MARKET_TIER || tier === 'shard_badge') return freeShard;
    return counts[tier] || 0;
  };
  const nameForTier = (tier) => {
    if (tier === SHARD_BADGE_MARKET_TIER || tier === 'shard_badge') return SHARD_BADGE.name;
    return BADGE_TIERS[tier]?.name || tier;
  };
  const metaForTier = (tier) => {
    if (tier === SHARD_BADGE_MARKET_TIER || tier === 'shard_badge') {
      return {
        name: SHARD_BADGE.name,
        color: SHARD_BADGE.color,
        image: SHARD_BADGE.image,
        emoji: SHARD_BADGE.emoji,
      };
    }
    return BADGE_TIERS[tier] || {};
  };
  const notify = (msg, ok = true) => {
    if (typeof onStatus === 'function') onStatus({ show: true, loading: false, message: msg, success: ok });
  };

  const applyInv = (inv, shardBal) => {
    if (inv && typeof setLocalInventory === 'function') setLocalInventory(inv);
    if (inv && typeof setStats === 'function') {
      setStats((prev) => ({ ...prev, inventory: inv }));
    }
    if (shardBal != null && typeof setBalance === 'function') {
      setBalance(Number(shardBal));
    }
  };

  const refresh = useCallback(async () => {
    if (!hasSecureSession()) return;
    setLoading(true);
    try {
      await ensureSecureSession();
      const [b, m] = await Promise.all([
        secureBadgeMarketBrowse({}),
        secureBadgeMarketMyListings().catch(() => ({ listings: [] })),
      ]);
      setListings(b.listings || []);
      setMine(m.listings || []);
    } catch (e) {
      console.warn('badge market refresh', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleList = async () => {
    if (!hasSecureSession()) {
      notify('❌ Login / session required to sell', false);
      return;
    }
    const qty = Math.floor(Number(sellQty) || 0);
    const price = Number(sellPrice) || 0;
    if (qty < 1) {
      notify('❌ Quantity must be ≥ 1', false);
      return;
    }
    if (freeForTier(sellTier) < qty) {
      notify(`❌ Not enough free ${nameForTier(sellTier)}`, false);
      return;
    }
    if (sellCurrency === 'g2u') {
      notify('❌ G2U listings open after launch. Use SOL.', false);
      return;
    }
    if (sellCurrency !== 'sol') {
      notify('❌ Badge market is SOL only until G2U launch (not G2Ushards).', false);
      return;
    }
    setBusyId('list');
    try {
      await ensureSecureSession();
      const data = await secureBadgeMarketList({
        tier: sellTier,
        qty,
        currency: 'sol',
        unit_price: price,
      });
      applyInv(data.inventory, data.shard_balance);
      notify(
        `✅ Listed ${qty}× ${nameForTier(sellTier)} @ ${price} ${
          sellCurrency === 'g2u' ? 'G2U' : 'SOL'
        } each (escrowed)`,
      );
      setTab('mine');
      await refresh();
    } catch (e) {
      notify(`❌ ${e?.message || 'List failed'}`, false);
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (listingId) => {
    setBusyId(listingId);
    try {
      await ensureSecureSession();
      const data = await secureBadgeMarketCancel(listingId);
      applyInv(data.inventory, data.shard_balance);
      notify('✅ Listing cancelled — badges returned');
      await refresh();
    } catch (e) {
      notify(`❌ ${e?.message || 'Cancel failed'}`, false);
    } finally {
      setBusyId(null);
    }
  };

  const paySolForListing = async (listing, sellerWallet) => {
    if (!decryptedPhrase) {
      throw new Error('Unlock your game wallet first to pay with SOL');
    }
    const kp = keypairFromMnemonic(decryptedPhrase);
    const gross = Number(listing.unit_price) * Number(listing.qty);
    const { fee, net } = feeSplit(gross);
    const connection = new Connection(RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
    const sellerPk = new PublicKey(sellerWallet);
    const treasPk = new PublicKey(TREASURY_SOL);
    const netLamports = Math.round(net * LAMPORTS_PER_SOL);
    const feeLamports = Math.round(fee * LAMPORTS_PER_SOL);
    if (netLamports < 1 || feeLamports < 1) {
      throw new Error('Price too small for SOL transfer');
    }
    const bal = await connection.getBalance(kp.publicKey);
    const need = netLamports + feeLamports + 5000;
    if (bal < need) {
      throw new Error(
        `Not enough SOL in game wallet (need ~${(need / LAMPORTS_PER_SOL).toFixed(4)} incl. fee)`,
      );
    }
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: sellerPk,
        lamports: netLamports,
      }),
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: treasPk,
        lamports: feeLamports,
      }),
    );
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = kp.publicKey;
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return sig;
  };

  const handleBuy = async (listing) => {
    if (!hasSecureSession()) {
      notify('❌ Login required to buy', false);
      return;
    }
    setBusyId(listing.id);
    try {
      await ensureSecureSession();
      let txSig = null;
      if (listing.currency === 'sol') {
        // Need seller wallet from browse — re-fetch detail via buy which returns seller_wallet error if missing.
        // Fetch seller wallet: include in listing if we extend browse; for now buy-sol path needs wallet from server after partial...
        // Pre-flight: call browse won't have seller wallet. Call my buy with dummy to get error OR add seller_wallet to browse.
        // We added only seller_id in browse. Extend: first attempt get listing seller wallet via a dry approach —
        // Secure buy for SOL requires tx first. Get wallet from listing by fetching players is blocked.
        // Fix: browse should return seller_wallet for active SOL listings.
        const sellerWallet = listing.seller_wallet;
        if (!sellerWallet) {
          throw new Error('Seller wallet missing on listing — refresh market');
        }
        notify('Sending SOL (95% seller + 5% treasury)…', true);
        txSig = await paySolForListing(listing, sellerWallet);
      } else if (listing.currency === 'g2u') {
        throw new Error('G2U badge market opens after launch. Use SOL listings for now.');
      } else {
        throw new Error('Unsupported currency');
      }
      const data = await secureBadgeMarketBuy(listing.id, txSig);
      applyInv(data.inventory, data.shard_balance);
      notify(
        `✅ Bought ${listing.qty}× ${nameForTier(listing.tier)}!`,
      );
      await refresh();
    } catch (e) {
      notify(`❌ ${e?.message || 'Buy failed'}`, false);
    } finally {
      setBusyId(null);
    }
  };

  const grossPreview =
    Math.max(0, Number(sellPrice) || 0) * Math.max(0, Math.floor(Number(sellQty) || 0));
  const split = feeSplit(grossPreview);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          background: 'linear-gradient(145deg, rgba(255,215,0,0.1), #0f172a)',
          border: '1px solid #ffd70055',
          borderRadius: 14,
          padding: 12,
        }}
      >
        <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 14 }}>
          Badge market (in-game)
        </div>
        <p style={{ color: '#888', fontSize: 11, margin: '6px 0 0', lineHeight: 1.4 }}>
          Trade weekly badges + Shard Badges in-game. List = escrow from backpack (Shard must be unequipped from Fate).
          Pay with <strong style={{ color: '#67e8f9' }}>SOL</strong> now.
          <strong style={{ color: '#4ade80' }}> G2U</strong> token after launch
          (not G2Ushards). Fee:{' '}
          <strong style={{ color: '#fbbf24' }}>5% treasury</strong> (seller gets 95%).
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { id: 'market', label: 'Market', color: '#ffd700' },
          { id: 'sell', label: 'Sell', color: '#4ade80' },
          { id: 'mine', label: 'My listings', color: '#67e8f9' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '10px 6px',
              borderRadius: 10,
              border: tab === t.id ? `2px solid ${t.color}` : '1px solid #333',
              background: tab === t.id ? 'rgba(255,255,255,0.06)' : '#1c1e22',
              color: tab === t.id ? t.color : '#888',
              fontWeight: 'bold',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'market' && (
        <>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            style={{
              alignSelf: 'flex-end',
              background: 'transparent',
              border: '1px solid #333',
              color: '#888',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {loading ? '…' : 'Refresh'}
          </button>
          {listings.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', padding: 24, fontSize: 13 }}>
              No active listings. Be the first to sell from the Sell tab.
            </div>
          ) : (
            listings.map((L) => {
              const meta = metaForTier(L.tier);
              const gross = Number(L.unit_price) * Number(L.qty);
              const curLabel = L.currency === 'g2u' ? 'G2U' : 'SOL';
              const curColor = L.currency === 'g2u' ? '#4ade80' : '#67e8f9';
              return (
                <div
                  key={L.id}
                  style={{
                    background: '#1c1e22',
                    border: `1px solid ${meta.color || '#333'}`,
                    borderRadius: 14,
                    padding: 12,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  {meta.image ? (
                    <img
                      src={meta.image}
                      alt={meta.name}
                      width={52}
                      height={52}
                      style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 8 }}
                    />
                  ) : (
                    <div style={{ fontSize: 28 }}>{meta.emoji || '🏅'}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                      {L.qty}× {meta.name || L.tier}
                    </div>
                    <div style={{ color: '#888', fontSize: 11 }}>
                      @{L.seller_username || 'player'} ·{' '}
                      {Number(L.unit_price).toLocaleString()} {curLabel} each
                    </div>
                    <div style={{ color: curColor, fontSize: 12, fontWeight: 'bold' }}>
                      Total {gross.toLocaleString()} {curLabel}
                      <span style={{ color: '#666', fontWeight: 'normal' }}>
                        {' '}
                        (seller nets ~{(gross * 0.95).toLocaleString()})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === L.id}
                    onClick={() => handleBuy(L)}
                    style={{
                      background: '#ffd700',
                      color: '#000',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontWeight: 'bold',
                      fontSize: 12,
                      cursor: busyId === L.id ? 'wait' : 'pointer',
                    }}
                  >
                    {busyId === L.id ? '…' : 'Buy'}
                  </button>
                </div>
              );
            })
          )}
        </>
      )}

      {tab === 'sell' && (
        <div
          style={{
            background: '#1c1e22',
            border: '1px solid #333',
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>
            List from backpack
          </div>
          <label style={{ color: '#888', fontSize: 11 }}>
            Badge
            <select
              value={sellTier}
              onChange={(e) => setSellTier(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #333',
                background: '#111',
                color: '#fff',
              }}
            >
              {marketCatalog.map((b) => (
                <option key={b.tier} value={b.tier}>
                  {b.name} (free {b.tier === 'shard' ? freeShard : counts[b.tier] || 0})
                </option>
              ))}
            </select>
          </label>
          <label style={{ color: '#888', fontSize: 11 }}>
            Quantity
            <input
              type="number"
              min={1}
              max={freeForTier(sellTier) || 1}
              value={sellQty}
              onChange={(e) => setSellQty(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #333',
                background: '#111',
                color: '#fff',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ color: '#888', fontSize: 11 }}>
            Currency
            <select
              value={sellCurrency}
              onChange={(e) => setSellCurrency(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #333',
                background: '#111',
                color: '#fff',
              }}
            >
              <option value="sol">SOL (game wallet) — live</option>
              <option value="g2u" disabled>
                G2U token — after launch
              </option>
            </select>
          </label>
          <label style={{ color: '#888', fontSize: 11 }}>
            Price per badge (SOL)
            <input
              type="number"
              min={0.001}
              step={0.001}
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #333',
                background: '#111',
                color: '#fff',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <div style={{ color: '#666', fontSize: 11, lineHeight: 1.4 }}>
            Gross {grossPreview.toLocaleString()} SOL · Fee 5% = {split.fee.toLocaleString()} · You
            receive {split.net.toLocaleString()} SOL when sold.
            Badges leave your backpack until sold or cancelled. G2U token listings open after launch.
          </div>
          {!playerWallet ? (
            <div style={{ color: '#f87171', fontSize: 11 }}>
              SOL listings need a game wallet on your account.
            </div>
          ) : null}
          <button
            type="button"
            disabled={busyId === 'list' || freeForTier(sellTier) < 1}
            onClick={handleList}
            style={{
              background: 'linear-gradient(90deg, #4ade80, #ffd700)',
              color: '#000',
              border: 'none',
              borderRadius: 10,
              padding: 12,
              fontWeight: 'bold',
              fontSize: 13,
              cursor: busyId === 'list' ? 'wait' : 'pointer',
            }}
          >
            {busyId === 'list' ? 'Listing…' : 'List for sale'}
          </button>
        </div>
      )}

      {tab === 'mine' && (
        <>
          {mine.filter((x) => x.status === 'active').length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', padding: 24, fontSize: 13 }}>
              No active listings.
            </div>
          ) : (
            mine
              .filter((x) => x.status === 'active')
              .map((L) => {
                const meta = metaForTier(L.tier);
                return (
                  <div
                    key={L.id}
                    style={{
                      background: '#1c1e22',
                      border: '1px solid #333',
                      borderRadius: 12,
                      padding: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {meta.image ? (
                      <img
                        src={meta.image}
                        alt=""
                        width={40}
                        height={40}
                        style={{ width: 40, height: 40, objectFit: 'contain' }}
                      />
                    ) : null}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                        {L.qty}× {meta.name || L.tier}
                      </div>
                      <div style={{ color: '#888', fontSize: 11 }}>
                        {Number(L.unit_price).toLocaleString()}{' '}
                        {L.currency === 'g2u' ? 'G2U' : 'SOL'} each · escrowed
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === L.id}
                      onClick={() => handleCancel(L.id)}
                      style={{
                        background: '#333',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 11,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                );
              })
          )}
          {mine.some((x) => x.status !== 'active') ? (
            <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>
              Recent: {mine.filter((x) => x.status !== 'active').length} closed (sold/cancelled)
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
