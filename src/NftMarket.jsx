/**
 * In-game P2P market for owned GiftLocksmith NFTs.
 * SOL now · G2U after launch · 5% treasury · not G2Ushards.
 *
 * Flow: List → Buyer pays SOL → Seller completes on-chain NFT transfer.
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
import { publicKeyFromSecret } from './mintLocksmith';
import { listGiftNfts } from './locksmith';
import { transferCoreNft } from './nftTransfer';
import { RPC_URL } from './rpc';
import {
  hasSecureSession,
  ensureSecureSession,
  callSecureFunction,
} from './secureApi';
import {
  filterAndSortNfts,
  formatNftListingTitle,
  deriveNftFilterMeta,
} from './nftMarketFilters';
import NftFilterBar from './NftFilterBar';

const FEE_BPS = 500;
const TREASURY_SOL = '8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm';

function feeSplit(gross) {
  const g = Math.max(0, Number(gross) || 0);
  const fee = Math.round(((g * FEE_BPS) / 10000) * 1e9) / 1e9;
  return { fee, net: Math.max(0, Math.round((g - fee) * 1e9) / 1e9), gross: g };
}

async function nftMarket(action, payload = {}) {
  return callSecureFunction('nft-market', { action, ...payload });
}

export default function NftMarket({
  decryptedPhrase,
  playerWallet,
  onStatus,
  onNftChange,
}) {
  const [tab, setTab] = useState('market'); // market | sell | mine
  const [listings, setListings] = useState([]);
  const [mine, setMine] = useState([]);
  const [asBuyer, setAsBuyer] = useState([]);
  const [owned, setOwned] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [sellAsset, setSellAsset] = useState('');
  const [sellPrice, setSellPrice] = useState('0.1');
  const [mRarity, setMRarity] = useState('all');
  const [mRole, setMRole] = useState('all');
  const [mLevel, setMLevel] = useState('all');
  const [mSort, setMSort] = useState('default');

  const notify = (msg, ok = true) => {
    if (typeof onStatus === 'function') {
      onStatus({ show: true, loading: false, message: msg, success: ok });
    }
  };

  const wallet =
    playerWallet ||
    (decryptedPhrase ? publicKeyFromSecret(decryptedPhrase) : null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (wallet) {
        const nfts = await listGiftNfts(wallet);
        setOwned(Array.isArray(nfts) ? nfts : []);
      } else {
        setOwned([]);
      }
      if (hasSecureSession()) {
        await ensureSecureSession();
        const [b, m] = await Promise.all([
          nftMarket('browse'),
          nftMarket('my_listings').catch(() => ({ listings: [], as_buyer: [] })),
        ]);
        setListings(b.listings || []);
        setMine(m.listings || []);
        setAsBuyer(m.as_buyer || []);
      }
    } catch (e) {
      console.warn('nft market refresh', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const listedAssetIds = new Set(
    [...listings, ...mine.filter((x) => x.status === 'active' || x.status === 'paid')].map(
      (x) => x.asset_id,
    ),
  );

  const handleList = async () => {
    if (!hasSecureSession()) {
      notify('❌ Login required', false);
      return;
    }
    if (!wallet || !decryptedPhrase) {
      notify('❌ Unlock game wallet to list NFTs', false);
      return;
    }
    const nft = owned.find((n) => n.id === sellAsset);
    if (!nft) {
      notify('❌ Select an NFT you own', false);
      return;
    }
    const price = Number(sellPrice) || 0;
    if (price < 0.01) {
      notify('❌ Min 0.01 SOL', false);
      return;
    }
    setBusyId('list');
    try {
      await ensureSecureSession();
      await nftMarket('list', {
        asset_id: nft.id,
        seller_wallet: wallet,
        currency: 'sol',
        price,
        name: formatNftListingTitle(nft),
        image_url: nft.image,
        collection: nft.collection || undefined,
      });
      notify(`✅ Listed ${nft.name} for ${price} SOL`);
      setTab('mine');
      await refresh();
      if (onNftChange) onNftChange();
    } catch (e) {
      notify(`❌ ${e?.message || 'List failed'}`, false);
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id) => {
    setBusyId(id);
    try {
      await ensureSecureSession();
      await nftMarket('cancel', { listing_id: id });
      notify('✅ Listing cancelled');
      await refresh();
    } catch (e) {
      notify(`❌ ${e?.message || 'Cancel failed'}`, false);
    } finally {
      setBusyId(null);
    }
  };

  const paySol = async (listing) => {
    if (!decryptedPhrase) throw new Error('Unlock game wallet to pay with SOL');
    const kp = keypairFromMnemonic(decryptedPhrase);
    const gross = Number(listing.price) || 0;
    const { fee, net } = feeSplit(gross);
    const connection = new Connection(RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
    const sellerPk = new PublicKey(listing.seller_wallet);
    const treasPk = new PublicKey(TREASURY_SOL);
    const netLamports = Math.round(net * LAMPORTS_PER_SOL);
    const feeLamports = Math.round(fee * LAMPORTS_PER_SOL);
    if (netLamports < 1 || feeLamports < 1) throw new Error('Price too small');
    const bal = await connection.getBalance(kp.publicKey);
    if (bal < netLamports + feeLamports + 8000) {
      throw new Error('Not enough SOL in game wallet for price + fee + network');
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
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    return sig;
  };

  const handleBuy = async (listing) => {
    if (!hasSecureSession()) {
      notify('❌ Login required', false);
      return;
    }
    if (!wallet || !decryptedPhrase) {
      notify('❌ Unlock game wallet to buy', false);
      return;
    }
    setBusyId(listing.id);
    try {
      await ensureSecureSession();
      notify('Sending SOL (95% seller + 5% treasury)…');
      const sig = await paySol(listing);
      const data = await nftMarket('buy', {
        listing_id: listing.id,
        buyer_wallet: wallet,
        tx_signature: sig,
      });
      notify(
        data.message ||
          '✅ Payment sent. Seller must transfer the NFT to your wallet (they complete in My listings).',
      );
      await refresh();
    } catch (e) {
      notify(`❌ ${e?.message || 'Buy failed'}`, false);
    } finally {
      setBusyId(null);
    }
  };

  /** Seller: transfer NFT on-chain then mark complete */
  const handleComplete = async (listing) => {
    if (!decryptedPhrase) {
      notify('❌ Unlock wallet to transfer NFT', false);
      return;
    }
    if (!listing.buyer_wallet) {
      notify('❌ No buyer wallet on listing', false);
      return;
    }
    setBusyId(listing.id);
    try {
      await ensureSecureSession();
      notify('Transferring NFT to buyer…');
      const { signature } = await transferCoreNft(
        decryptedPhrase,
        listing.asset_id,
        listing.buyer_wallet,
      );
      await nftMarket('complete', {
        listing_id: listing.id,
        transfer_tx_signature: signature,
      });
      notify('✅ Sale complete — NFT sent to buyer');
      await refresh();
      if (onNftChange) onNftChange();
    } catch (e) {
      notify(`❌ ${e?.message || 'Complete failed'}`, false);
    } finally {
      setBusyId(null);
    }
  };

  const sellable = owned.filter((n) => !listedAssetIds.has(n.id));
  const pendingComplete = mine.filter((x) => x.status === 'paid');

  const filteredBrowse = filterAndSortNfts(
    listings.map((L) => ({
      ...L,
      // Prefer title fields; derive role/rarity/level from name for older listings
      ...deriveNftFilterMeta(L),
      price: Number(L.price) || 0,
      name: L.name || 'NFT',
    })),
    { rarity: mRarity, role: mRole, level: mLevel, sort: mSort },
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      <div
        style={{
          background: 'linear-gradient(145deg, rgba(153,69,255,0.15), #0f172a)',
          border: '1px solid #9945FF88',
          borderRadius: 14,
          padding: 12,
        }}
      >
        <div style={{ color: '#c084fc', fontWeight: 'bold', fontSize: 14 }}>
          NFT market (in-game)
        </div>
        <p style={{ color: '#888', fontSize: 11, margin: '6px 0 0', lineHeight: 1.4 }}>
          Buy &amp; sell NFT. Pay with{' '}
          <strong style={{ color: '#67e8f9' }}>SOL</strong> now (
          <strong style={{ color: '#4ade80' }}>G2U</strong> after launch).{' '}
          <strong style={{ color: '#fbbf24' }}>5% treasury</strong>.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { id: 'market', label: 'Market', color: '#c084fc' },
          { id: 'sell', label: 'Sell NFT', color: '#4ade80' },
          { id: 'mine', label: 'My sales', color: '#67e8f9' },
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
            {t.id === 'mine' && pendingComplete.length > 0
              ? ` (${pendingComplete.length})`
              : ''}
          </button>
        ))}
      </div>

      {tab === 'market' && (
        <>
          <NftFilterBar
            rarity={mRarity}
            role={mRole}
            level={mLevel}
            sort={mSort}
            resultCount={listings.length === 0 ? 0 : filteredBrowse.length}
            totalCount={listings.length}
            onChange={(patch) => {
              if (patch.rarity != null) setMRarity(patch.rarity);
              if (patch.role != null) setMRole(patch.role);
              if (patch.level != null) setMLevel(patch.level);
              if (patch.sort != null) setMSort(patch.sort);
            }}
            trailing={
              <button
                type="button"
                onClick={refresh}
                style={{
                  flexShrink: 0,
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
            }
          />
          {listings.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', padding: 20, fontSize: 13 }}>
              No NFTs for sale. List one you own under Sell NFT.
            </div>
          ) : filteredBrowse.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', padding: 20, fontSize: 13 }}>
              No listings match these filters.
            </div>
          ) : (
            filteredBrowse.map((L) => (
              <div
                key={L.id}
                style={{
                  background: '#1c1e22',
                  border: '1px solid #9945FF55',
                  borderRadius: 14,
                  padding: 12,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                {L.image_url ? (
                  <img
                    src={L.image_url}
                    alt=""
                    width={56}
                    height={56}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      objectFit: 'cover',
                      background: '#000',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 32 }}>🔑</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                    {L.name || 'GiftLocksmith'}
                  </div>
                  <div style={{ color: '#888', fontSize: 11 }}>
                    @{L.seller_username || 'seller'} · {String(L.asset_id).slice(0, 6)}…
                  </div>
                  <div style={{ color: '#67e8f9', fontWeight: 'bold', fontSize: 13 }}>
                    {Number(L.price).toLocaleString()} SOL
                    <span style={{ color: '#666', fontWeight: 'normal', fontSize: 11 }}>
                      {' '}
                      (seller nets ~{(Number(L.price) * 0.95).toFixed(4)})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === L.id}
                  onClick={() => handleBuy(L)}
                  style={{
                    background: '#9945FF',
                    color: '#fff',
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
            ))
          )}
          {asBuyer.filter((x) => x.status === 'paid').length > 0 ? (
            <div
              style={{
                background: 'rgba(103,232,249,0.08)',
                border: '1px solid #67e8f9',
                borderRadius: 12,
                padding: 10,
                fontSize: 11,
                color: '#67e8f9',
              }}
            >
              You paid for {asBuyer.filter((x) => x.status === 'paid').length} NFT(s) — waiting on
              seller transfer to your game wallet.
            </div>
          ) : null}
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
            List an NFT you own
          </div>
          {!wallet ? (
            <div style={{ color: '#f87171', fontSize: 12 }}>
              Unlock your game wallet to see owned NFTs.
            </div>
          ) : sellable.length === 0 ? (
            <div style={{ color: '#888', fontSize: 12 }}>
              {owned.length === 0
                ? 'No GiftLocksmith in this wallet. Mint one in Shop → NFTs first.'
                : 'All owned NFTs are already listed or awaiting transfer.'}
            </div>
          ) : (
            <>
              <label style={{ color: '#888', fontSize: 11 }}>
                Your NFT
                <select
                  value={sellAsset}
                  onChange={(e) => setSellAsset(e.target.value)}
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
                  <option value="">Select…</option>
                  {sellable.map((n) => (
                    <option key={n.id} value={n.id}>
                      {formatNftListingTitle(n)} ({String(n.id).slice(0, 6)}…)
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ color: '#888', fontSize: 11 }}>
                Price (SOL)
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
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
              <div style={{ color: '#666', fontSize: 11 }}>
                Fee 5% · you receive ~{(Number(sellPrice || 0) * 0.95).toFixed(4)} SOL when the
                buyer pays and you complete the transfer. G2U listings after launch.
              </div>
              <button
                type="button"
                disabled={busyId === 'list' || !sellAsset}
                onClick={handleList}
                style={{
                  background: 'linear-gradient(90deg, #9945FF, #14F195)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: 12,
                  fontWeight: 'bold',
                  cursor: busyId === 'list' ? 'wait' : 'pointer',
                }}
              >
                {busyId === 'list' ? 'Listing…' : 'List for sale'}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <>
          {pendingComplete.length > 0 ? (
            <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 'bold' }}>
              Action needed — complete transfer for paid sales
            </div>
          ) : null}
          {mine.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', padding: 20, fontSize: 13 }}>
              No sales yet.
            </div>
          ) : (
            mine.map((L) => (
              <div
                key={L.id}
                style={{
                  background: '#1c1e22',
                  border:
                    L.status === 'paid' ? '1px solid #fbbf24' : '1px solid #333',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                {L.image_url ? (
                  <img
                    src={L.image_url}
                    alt=""
                    width={44}
                    height={44}
                    style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }}
                  />
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                    {L.name || 'NFT'}
                  </div>
                  <div style={{ color: '#888', fontSize: 11 }}>
                    {Number(L.price).toLocaleString()} SOL · {L.status}
                    {L.buyer_username ? ` · buyer @${L.buyer_username}` : ''}
                  </div>
                </div>
                {L.status === 'active' ? (
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
                ) : null}
                {L.status === 'paid' ? (
                  <button
                    type="button"
                    disabled={busyId === L.id}
                    onClick={() => handleComplete(L)}
                    style={{
                      background: '#fbbf24',
                      color: '#000',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 11,
                      fontWeight: 'bold',
                      cursor: busyId === L.id ? 'wait' : 'pointer',
                    }}
                  >
                    {busyId === L.id ? '…' : 'Send NFT'}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
