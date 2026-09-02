import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { listGiftNfts } from './locksmith';
import { transferCoreNft } from './nftTransfer';
import {
  secureShadowClaim,
  secureElfLevelUp,
  secureStarLevelUp,
  secureNftSetLevel,
  secureFateEquip,
  secureNftDurabilityTopUp,
  secureSyncChainBalances,
  hasSecureSession,
  ensureSecureSession,
} from './secureApi';
import { MINT_ADDRESS } from './config';
import { syncAllGiftNftOwnership } from './nftOwnershipSync';
import {
  durabilityForWalletNft,
  kindFromNft,
  NFT_DURABILITY_G2U_PER_PERCENT,
} from './nftDurability';
import DurabilityReloadModal from './DurabilityReloadModal';
import {
  getEquippedShardBadgeOnFate,
  getFreeShardBadgeCount,
  getStarLevel,
  starLevelUpCostSol,
  STAR_MAX_LEVEL,
} from './shardBadge';
import { keypairFromMnemonic } from './solanaWallet';
import { RPC_URL } from './rpc';
import {
  getElfLevel,
  elfLevelUpCostSol,
  elfLevelUpCostG2u,
  g2uPerSolClient,
  ELF_MAX_LEVEL,
  ELF_LEVEL_UP_TREASURY,
  ELF_LEVEL_UP_FEE_WALLET,
  ELF_LEVEL_UP_FEE_SOL,
  normElfRarity,
} from './elfLevelUp';
import {
  wallsClimbedLabels,
  nextWallTargetLabel,
} from './locksmithWalls';
import { isTokenLaunched } from './tokenLaunch';

/**
 * In-game wallet NFTs. Detail: Send / Sell.
 * gameplayMode (Backpack → NFT): level + Level up price (no address focus).
 */
export default function WalletNftSection({
  walletAddress,
  walletSecret = '',
  refreshKey = 0,
  onOpenShopNfts,
  onSellNft,
  notify,
  inventory = null,
  onInventoryChange = null,
  /** After on-chain SOL spend (NFT level-up): parent refreshes Gift Tap SOL chip */
  onChainBalanceChange = null,
  gameplayMode = false,
  maxUnlockedLevel = 4,
  /** Liquid $G2U (gft_token_balance) for durability reload */
  gftTokenBalance = 0,
  onGftBalanceChange = null,
  /**
   * Wallet UI: one “NFT (N)” button like Backpack; tap expands the list.
   * Backpack gameplayMode keeps the full list open.
   */
  compactButton = false,
}) {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listOpen, setListOpen] = useState(!compactButton);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sending, setSending] = useState(false);
  const [listKey, setListKey] = useState(0);
  const [equipBusy, setEquipBusy] = useState(false);
  const [levelBusy, setLevelBusy] = useState(false);
  const [levelConfirmOpen, setLevelConfirmOpen] = useState(false);
  const [durBusy, setDurBusy] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [localInv, setLocalInv] = useState(inventory || {});
  const [localGft, setLocalGft] = useState(Number(gftTokenBalance) || 0);

  /** Prefer in-game AppNotice / Marketplace txStatus — never window.alert ("gift2u.fun says…"). */
  const toast = (msg, ok = true) => {
    if (typeof notify === 'function') notify(msg, { success: !!ok });
    else if (!ok) console.warn(msg);
    else console.log(msg);
  };

  useEffect(() => {
    if (inventory && typeof inventory === 'object') {
      setLocalInv(inventory);
    }
  }, [inventory]);

  useEffect(() => {
    setLocalGft(Number(gftTokenBalance) || 0);
  }, [gftTokenBalance]);

  const selectedDurability = useMemo(() => {
    if (!selected) return null;
    return durabilityForWalletNft(localInv, selected);
  }, [selected, localInv]);

  const selectedDurKind = useMemo(() => kindFromNft(selected), [selected]);

  const handleDurabilityReload = useCallback(
    async (percent = 1) => {
      if (!selectedDurKind || durBusy) return;
      const pct = Math.max(1, Math.floor(Number(percent) || 1));
      const costG2u = pct * NFT_DURABILITY_G2U_PER_PERCENT;
      setDurBusy(true);
      try {
        if (!isTokenLaunched()) {
          throw new Error('Durability reload opens after $G2U launch');
        }
        const secret = String(walletSecret || '').trim();
        if (!secret) {
          throw new Error('Unlock your game wallet first');
        }
        if (!hasSecureSession()) {
          await ensureSecureSession();
        }
        const connection = new Connection(RPC_URL, 'confirmed');
        let playerKeypair;
        if (secret.includes(' ')) {
          playerKeypair = keypairFromMnemonic(secret.trim());
        } else {
          playerKeypair = Keypair.fromSecretKey(bs58.decode(secret));
        }
        if (
          walletAddress &&
          playerKeypair.publicKey.toBase58() !== String(walletAddress).trim()
        ) {
          throw new Error('Unlocked wallet does not match your game wallet');
        }

        // On-chain $G2U → master + 0.0005 SOL → treasury (same as NFT level-up)
        const masterWallet = new PublicKey(ELF_LEVEL_UP_TREASURY);
        const feeWallet = new PublicKey(ELF_LEVEL_UP_FEE_WALLET);
        const feeLamports = Math.floor(ELF_LEVEL_UP_FEE_SOL * LAMPORTS_PER_SOL);
        const G2U_DECIMALS = 9;
        const amountRaw = BigInt(costG2u) * 10n ** BigInt(G2U_DECIMALS);
        const fromAta = getAssociatedTokenAddressSync(
          MINT_ADDRESS,
          playerKeypair.publicKey,
        );
        const toAta = getAssociatedTokenAddressSync(MINT_ADDRESS, masterWallet);
        const solBal = await connection.getBalance(playerKeypair.publicKey);
        const needSol = feeLamports + 5_000_000;
        if (solBal < needSol) {
          throw new Error(
            `Need ~${(needSol / LAMPORTS_PER_SOL).toFixed(4)} SOL (0.0005 treasury fee + network).`,
          );
        }

        toast(
          `Sending ${costG2u.toLocaleString()} $G2U + ${ELF_LEVEL_UP_FEE_SOL} SOL fee…`,
          true,
        );

        const g2uTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
          createAssociatedTokenAccountIdempotentInstruction(
            playerKeypair.publicKey,
            toAta,
            masterWallet,
            MINT_ADDRESS,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
          createTransferCheckedInstruction(
            fromAta,
            MINT_ADDRESS,
            toAta,
            playerKeypair.publicKey,
            amountRaw,
            G2U_DECIMALS,
          ),
          SystemProgram.transfer({
            fromPubkey: playerKeypair.publicKey,
            toPubkey: feeWallet,
            lamports: feeLamports,
          }),
        );
        const latest = await connection.getLatestBlockhash('confirmed');
        g2uTx.recentBlockhash = latest.blockhash;
        g2uTx.feePayer = playerKeypair.publicKey;
        const signature = await sendAndConfirmTransaction(connection, g2uTx, [
          playerKeypair,
        ]);

        const data = await secureNftDurabilityTopUp({
          kind: selectedDurKind,
          percent: pct,
          asset_id: selected?.id || undefined,
          tx_signature: signature,
        });
        const nextInv = data.inventory || localInv;
        setLocalInv(nextInv);
        if (typeof onInventoryChange === 'function') onInventoryChange(nextInv);

        // Refresh live $G2U / SOL from chain (not DB debit)
        try {
          const balInfo = await connection.getTokenAccountBalance(fromAta);
          const g2uUi = Number(balInfo?.value?.uiAmount);
          const lamportsAfter = await connection.getBalance(
            playerKeypair.publicKey,
          );
          const solAfter = lamportsAfter / LAMPORTS_PER_SOL;
          if (Number.isFinite(g2uUi)) {
            setLocalGft(g2uUi);
            if (typeof onGftBalanceChange === 'function') onGftBalanceChange(g2uUi);
          }
          if (typeof onChainBalanceChange === 'function') {
            onChainBalanceChange({
              ...(Number.isFinite(g2uUi) ? { g2u: g2uUi } : {}),
              sol: solAfter,
            });
          }
          try {
            await secureSyncChainBalances();
          } catch {
            /* ignore */
          }
        } catch (balErr) {
          console.warn('post durability balance refresh', balErr?.message || balErr);
          if (typeof onChainBalanceChange === 'function') {
            onChainBalanceChange({});
          }
        }

        setReloadOpen(false);
        toast(
          `${selectedDurKind} +${data.percent_added}% durability (−${Number(data.cost_g2u ?? costG2u).toLocaleString()} $G2U + ${ELF_LEVEL_UP_FEE_SOL} SOL) → ${Math.round(data.durability_after)}%`,
          true,
        );
      } catch (e) {
        toast(e?.message || 'Durability reload failed', false);
      } finally {
        setDurBusy(false);
      }
    },
    [
      selectedDurKind,
      selected,
      durBusy,
      localInv,
      walletSecret,
      walletAddress,
      onInventoryChange,
      onGftBalanceChange,
      onChainBalanceChange,
    ],
  );

  const isStarSelected =
    String(selected?.kind || '').toLowerCase() === 'star';

  const selectedLevel = useMemo(() => {
    if (!selected?.id) return 1;
    if (String(selected.kind || '').toLowerCase() === 'star') {
      return getStarLevel(localInv, selected.id);
    }
    return getElfLevel(localInv, selected.id);
  }, [selected, localInv]);

  const useG2uLevelUp = isTokenLaunched();
  const selectedLevelCost = useMemo(() => {
    if (!selected) return null;
    const kind = String(selected.kind || '').toLowerCase();
    if (kind === 'star') {
      const sol = starLevelUpCostSol(selectedLevel);
      if (sol == null) return null;
      return useG2uLevelUp ? Math.round(sol * g2uPerSolClient()) : sol;
    }
    return useG2uLevelUp
      ? elfLevelUpCostG2u(selected.rarity, selectedLevel, selected.kind)
      : elfLevelUpCostSol(selected.rarity, selectedLevel, selected.kind);
  }, [selected, selectedLevel, useG2uLevelUp]);

  const starEquipped = useMemo(() => {
    if (!selected?.id) return null;
    return getEquippedShardBadgeOnFate(localInv, selected.id);
  }, [selected, localInv]);

  const walletStarCount = useMemo(
    () => nfts.filter((n) => String(n.kind || '').toLowerCase() === 'star').length,
    [nfts],
  );

  const freeStars = useMemo(() => {
    const fromInv = getFreeShardBadgeCount(localInv);
    const invOwned = Math.max(
      0,
      Math.floor(Number(localInv?.shard_badge) || 0),
    );
    let equippedN = 0;
    const map = localInv?.fate_equip;
    if (map && typeof map === 'object') {
      for (const row of Object.values(map)) {
        if (!row || typeof row !== 'object') continue;
        const itemId = String(row.itemId || row.item_id || '').toLowerCase();
        const tier = String(row.tier || '').toLowerCase();
        if (
          itemId === 'shard_badge' ||
          tier === 'shard' ||
          tier === 'shard_badge'
        ) {
          equippedN += 1;
        }
      }
    }
    const owned = Math.max(invOwned, walletStarCount);
    return Math.max(fromInv, owned - equippedN);
  }, [localInv, walletStarCount]);

  const socketableKind = useMemo(() => {
    const k = String(selected?.kind || '').toLowerCase();
    return ['fate', 'echo', 'rush', 'shadow'].includes(k) ? k : null;
  }, [selected]);

  const isLocksmithSelected =
    String(selected?.kind || '').toLowerCase() === 'locksmith';

  const climbedWalls = useMemo(
    () => wallsClimbedLabels(maxUnlockedLevel),
    [maxUnlockedLevel],
  );
  const nextWall = useMemo(
    () => nextWallTargetLabel(maxUnlockedLevel),
    [maxUnlockedLevel],
  );

  const handleStarEquip = useCallback(
    async (wantEquip) => {
      if (!selected?.id || !socketableKind || equipBusy) return;
      if (wantEquip && freeStars < 1) {
        toast('No Star Badge — mint one in Shop → NFTs', false);
        return;
      }
      setEquipBusy(true);
      try {
        let starAssetId;
        if (wantEquip) {
          const equippedIds = new Set();
          const map = localInv?.fate_equip;
          if (map && typeof map === 'object') {
            for (const row of Object.values(map)) {
              const sid = row?.star_asset_id || row?.starAssetId;
              if (sid) equippedIds.add(String(sid));
            }
          }
          const freeStar = nfts.find(
            (n) =>
              String(n.kind || '').toLowerCase() === 'star' &&
              !equippedIds.has(String(n.id)),
          );
          starAssetId = freeStar?.id;
        }
        const data = await secureFateEquip({
          assetId: selected.id,
          equip: !!wantEquip,
          ...(starAssetId ? { starAssetId } : {}),
        });
        const nextInv = data.inventory || localInv;
        setLocalInv(nextInv);
        if (typeof onInventoryChange === 'function') onInventoryChange(nextInv);
        toast(wantEquip ? 'Star equipped' : 'Star unequipped', true);
      } catch (e) {
        toast(e?.message || 'Star equip failed', false);
      } finally {
        setEquipBusy(false);
      }
    },
    [
      selected,
      socketableKind,
      equipBusy,
      freeStars,
      localInv,
      nfts,
      onInventoryChange,
    ],
  );

  const handleLevelUp = useCallback(async () => {
    if (!selected || !gameplayMode || levelBusy) return;
    const kind = String(selected.kind || '').toLowerCase();
    const isStar = kind === 'star';
    if (
      !isStar &&
      !['fate', 'echo', 'rush', 'shadow', 'locksmith'].includes(kind)
    ) {
      toast('Level up is for Gift2u Elves / Star Badge', false);
      return;
    }
    const costSol = isStar
      ? starLevelUpCostSol(selectedLevel)
      : elfLevelUpCostSol(selected.rarity, selectedLevel, kind);
    if (costSol == null) {
      toast('Already max level (L5)', false);
      return;
    }
    const payG2u = isTokenLaunched();
    const costG2u = Math.round(costSol * g2uPerSolClient());
    setLevelBusy(true);
    try {
      let data;
      const secret = String(walletSecret || '').trim();
      if (!secret) {
        toast('Unlock your game wallet first', false);
        return;
      }
      if (!hasSecureSession()) {
        await ensureSecureSession();
      }
      const connection = new Connection(RPC_URL, 'confirmed');
      let playerKeypair;
      if (secret.includes(' ')) {
        playerKeypair = keypairFromMnemonic(secret.trim());
      } else {
        playerKeypair = Keypair.fromSecretKey(bs58.decode(secret));
      }
      if (
        walletAddress &&
        playerKeypair.publicKey.toBase58() !== String(walletAddress).trim()
      ) {
        throw new Error('Unlocked wallet does not match your game wallet');
      }
      const masterWallet = new PublicKey(ELF_LEVEL_UP_TREASURY);

      if (payG2u) {
        // On-chain $G2U → master + 0.0005 SOL project fee → treasury
        const G2U_DECIMALS = 9;
        const feeWallet = new PublicKey(ELF_LEVEL_UP_FEE_WALLET);
        const feeLamports = Math.floor(ELF_LEVEL_UP_FEE_SOL * LAMPORTS_PER_SOL);
        const amountRaw = BigInt(costG2u) * 10n ** BigInt(G2U_DECIMALS);
        const fromAta = getAssociatedTokenAddressSync(
          MINT_ADDRESS,
          playerKeypair.publicKey,
        );
        const toAta = getAssociatedTokenAddressSync(MINT_ADDRESS, masterWallet);
        const solBal = await connection.getBalance(playerKeypair.publicKey);
        const needSol = feeLamports + 5_000_000;
        if (solBal < needSol) {
          throw new Error(
            `Need ~${(needSol / LAMPORTS_PER_SOL).toFixed(4)} SOL (0.0005 treasury fee + network).`,
          );
        }
        toast(
          `Sending ${costG2u.toLocaleString()} $G2U + ${ELF_LEVEL_UP_FEE_SOL} SOL fee…`,
          true,
        );
        const g2uTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
          createAssociatedTokenAccountIdempotentInstruction(
            playerKeypair.publicKey,
            toAta,
            masterWallet,
            MINT_ADDRESS,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
          createTransferCheckedInstruction(
            fromAta,
            MINT_ADDRESS,
            toAta,
            playerKeypair.publicKey,
            amountRaw,
            G2U_DECIMALS,
          ),
          SystemProgram.transfer({
            fromPubkey: playerKeypair.publicKey,
            toPubkey: feeWallet,
            lamports: feeLamports,
          }),
        );
        const latest = await connection.getLatestBlockhash('confirmed');
        g2uTx.recentBlockhash = latest.blockhash;
        g2uTx.feePayer = playerKeypair.publicKey;
        const signature = await sendAndConfirmTransaction(connection, g2uTx, [
          playerKeypair,
        ]);
        // Refresh wallet $G2U (+ SOL) immediately and mirror into Supabase
        try {
          const balInfo = await connection.getTokenAccountBalance(fromAta);
          const g2uUi = Number(balInfo?.value?.uiAmount);
          const lamportsAfter = await connection.getBalance(
            playerKeypair.publicKey,
          );
          const solAfter = lamportsAfter / LAMPORTS_PER_SOL;
          if (Number.isFinite(g2uUi)) {
            setLocalGft(g2uUi);
            if (typeof onGftBalanceChange === 'function') onGftBalanceChange(g2uUi);
          }
          if (typeof onChainBalanceChange === 'function') {
            onChainBalanceChange({
              ...(Number.isFinite(g2uUi) ? { g2u: g2uUi } : {}),
              sol: solAfter,
            });
          }
          try {
            await secureSyncChainBalances();
          } catch {
            /* ignore — HUD already updated */
          }
        } catch (balErr) {
          console.warn('post level-up balance refresh', balErr?.message || balErr);
          if (typeof onChainBalanceChange === 'function') {
            onChainBalanceChange({});
          }
        }
        if (isStar) {
          data = await secureStarLevelUp({
            assetId: selected.id,
            txSignature: signature,
            currency: 'g2u',
          });
        } else {
          data = await secureElfLevelUp({
            assetId: selected.id,
            kind,
            rarity: normElfRarity(selected.rarity),
            txSignature: signature,
            currency: 'g2u',
          });
        }
      } else {
        const feeWallet = new PublicKey(ELF_LEVEL_UP_FEE_WALLET);
        const itemLamports = Math.floor(costSol * LAMPORTS_PER_SOL);
        const feeLamports = Math.floor(ELF_LEVEL_UP_FEE_SOL * LAMPORTS_PER_SOL);
        const need = itemLamports + feeLamports + 1_000_000;
        const bal = await connection.getBalance(playerKeypair.publicKey);
        if (bal < need) {
          throw new Error(
            `Need ~${(need / LAMPORTS_PER_SOL).toFixed(4)} SOL (level-up + fees)`,
          );
        }
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }),
          SystemProgram.transfer({
            fromPubkey: playerKeypair.publicKey,
            toPubkey: masterWallet,
            lamports: itemLamports,
          }),
          SystemProgram.transfer({
            fromPubkey: playerKeypair.publicKey,
            toPubkey: feeWallet,
            lamports: feeLamports,
          }),
        );
        const signature = await sendAndConfirmTransaction(connection, tx, [
          playerKeypair,
        ]);
        if (isStar) {
          data = await secureStarLevelUp({
            assetId: selected.id,
            txSignature: signature,
            currency: 'sol',
          });
        } else {
          data = await secureElfLevelUp({
            assetId: selected.id,
            kind,
            rarity: normElfRarity(selected.rarity),
            txSignature: signature,
            currency: 'sol',
          });
        }
        try {
          const lamportsAfter = await connection.getBalance(
            playerKeypair.publicKey,
          );
          const solAfter = lamportsAfter / LAMPORTS_PER_SOL;
          if (typeof onChainBalanceChange === 'function') {
            onChainBalanceChange({ sol: solAfter });
          }
        } catch (balErr) {
          console.warn('post level-up SOL refresh', balErr?.message || balErr);
        }
      }
      const nextInv = data.inventory || localInv;
      setLocalInv(nextInv);
      if (typeof onInventoryChange === 'function') {
        const patch = {};
        if (data.tap_power != null) patch.tap_power = Number(data.tap_power);
        if (data.max_daily_limit != null) {
          patch.max_daily_limit = Number(data.max_daily_limit);
        }
        if (data.gft_token_balance != null) {
          patch.gft_token_balance = Number(data.gft_token_balance);
        }
        onInventoryChange(
          nextInv,
          Object.keys(patch).length ? patch : undefined,
        );
      }
      toast(
        payG2u
          ? `Level up → L${data.to_level} (−${(data.cost_g2u ?? costG2u).toLocaleString()} $G2U)`
          : `Level up → L${data.to_level} (−${costSol} SOL)`,
        true,
      );
      try {
        await secureNftSetLevel({
          assetId: selected.id,
          level: data.to_level,
          kind: isStar ? 'star' : kind,
          rarity: selected.rarity,
        });
      } catch (metaErr) {
        console.warn('nft-set-level', metaErr?.message || metaErr);
      }
    } catch (e) {
      toast(e?.message || 'Level up failed', false);
    } finally {
      setLevelBusy(false);
    }
  }, [
    selected,
    gameplayMode,
    levelBusy,
    selectedLevel,
    walletSecret,
    walletAddress,
    localInv,
    localGft,
    onInventoryChange,
    onChainBalanceChange,
    onGftBalanceChange,
  ]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected?.jsonUri) return;
      const needs =
        !selected.description ||
        !selected.attributes ||
        selected.attributes.length === 0 ||
        !selected.image;
      if (!needs) return;
      setDetailLoading(true);
      try {
        const res = await fetch(selected.jsonUri);
        if (!res.ok) return;
        const meta = await res.json();
        if (cancelled) return;
        setSelected((prev) => {
          if (!prev || prev.id !== selected.id) return prev;
          const attrs = Array.isArray(meta.attributes)
            ? meta.attributes
                .map((a) => ({
                  trait_type: String(a?.trait_type || a?.traitType || a?.key || ''),
                  value: String(a?.value ?? ''),
                }))
                .filter((a) => a.trait_type || a.value)
            : prev.attributes || [];
          return {
            ...prev,
            name: meta.name || prev.name,
            symbol: meta.symbol || prev.symbol,
            description: meta.description || prev.description || '',
            image: meta.image || prev.image,
            attributes: attrs.length ? attrs : prev.attributes || [],
          };
        });
      } catch {
        /* offline */
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.jsonUri]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walletAddress) {
        setNfts([]);
        setError('');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const list = await listGiftNfts(walletAddress);
        if (!cancelled) setNfts(list);
      } catch (e) {
        if (!cancelled) {
          setNfts([]);
          setError(e?.message || 'Could not load NFTs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, refreshKey, listKey]);

  // Ownership sync — reuse the list we just fetched (no second DAS). Throttled inside sync.
  useEffect(() => {
    if (!walletAddress || !hasSecureSession()) return undefined;
    if (!nfts.length) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await syncAllGiftNftOwnership({
          walletAddress,
          inventory: localInv || inventory || {},
          prefetchedNfts: nfts,
          prefetchedOk: true,
        });
        if (cancelled || result.skipped) return;
        if (!result.changed || !result.inventory) return;
        // Keep existing backpack items; only write keys returned by sync (NFT slots)
        setLocalInv((prev) => ({
          ...(prev && typeof prev === 'object' ? prev : {}),
          ...result.inventory,
        }));
        if (typeof onInventoryChange === 'function') {
          const patch = {};
          if (result.tap_power != null) patch.tap_power = result.tap_power;
          if (result.max_daily_limit != null) {
            patch.max_daily_limit = result.max_daily_limit;
          }
          onInventoryChange(
            result.inventory,
            Object.keys(patch).length ? patch : undefined,
          );
        }
      } catch (e) {
        console.warn('nft ownership sync', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfts, walletAddress]);

  const copyMint = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setSendOpen(false);
    setSendTo('');
    setSending(false);
    setReloadOpen(false);
  };

  const handleSell = () => {
    if (!selected) return;
    const nft = selected;
    closeDetail();
    if (typeof onSellNft === 'function') {
      onSellNft(nft);
    } else if (typeof onOpenShopNfts === 'function') {
      onOpenShopNfts(nft);
    } else {
      toast('Open Shop → NFTs → Sell to list this NFT', true);
    }
  };

  const handleSend = async () => {
    if (!selected) return;
    const to = String(sendTo || '').trim();
    if (to.length < 32) {
      toast('Enter a valid Solana wallet address', false);
      return;
    }
    if (walletAddress && to === walletAddress) {
      toast('Cannot send to the same wallet', false);
      return;
    }
    const secret = String(walletSecret || '').trim();
    if (!secret) {
      toast('Unlock your game wallet first (log in / restore phrase)', false);
      return;
    }
    setSending(true);
    try {
      const { signature } = await transferCoreNft(secret, selected.id, to);
      toast(`NFT sent! ${String(signature).slice(0, 12)}…`, true);
      closeDetail();
      setListKey((k) => k + 1);
    } catch (e) {
      toast(e?.message || 'Send failed', false);
    } finally {
      setSending(false);
    }
  };

  // Compact wallet entry: one button with count (like Backpack hub cards)
  if (compactButton && !listOpen) {
    const countLabel = loading ? '…' : String(nfts.length);
    return (
      <>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          style={{
            width: '100%',
            marginTop: 12,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            background: '#111',
            border: '1px solid #333',
            borderRadius: 12,
            padding: '12px 14px',
            cursor: 'pointer',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            textAlign: 'left',
          }}
        >
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
            NFT
          </span>
          <span
            style={{
              color: '#fff',
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            {countLabel}
          </span>
        </button>
        {error ? (
          <p style={{ color: '#f87171', fontSize: 11, margin: '4px 0 0' }}>{error}</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div
        style={{
          marginTop: '16px',
          marginBottom: '4px',
          textAlign: 'left',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '12px',
          padding: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
          }}
        >
          <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '13px' }}>
            🖼 NFTs
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#888', fontSize: '11px' }}>
              {loading ? 'Scanning…' : `${nfts.length} on this wallet`}
            </span>
            {compactButton ? (
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setListOpen(false);
                }}
                style={{
                  background: 'none',
                  border: '1px solid #444',
                  borderRadius: 8,
                  color: '#aaa',
                  fontSize: 11,
                  fontWeight: 'bold',
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            ) : null}
          </span>
        </div>

        {error ? (
          <p style={{ color: '#f87171', fontSize: '11px', margin: '0 0 8px' }}>{error}</p>
        ) : null}

        {!loading && nfts.length === 0 ? (
          <div>
            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 10px', lineHeight: 1.4 }}>
              No Gift2u Elves NFTs in this game wallet yet. Mint Fate or GiftLocksmith in Shop → NFTs.
            </p>
            {typeof onOpenShopNfts === 'function' ? (
              <button
                type="button"
                onClick={() => onOpenShopNfts()}
                style={{
                  width: '100%',
                  background: 'rgba(153,69,255,0.2)',
                  color: '#c4b5fd',
                  border: '1px solid #9945FF',
                  borderRadius: '8px',
                  padding: '8px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Open Shop → NFTs
              </button>
            ) : null}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {nfts.map((nft) => (
              <button
                key={nft.id}
                type="button"
                onClick={() => {
                  setCopied(false);
                  setSendOpen(false);
                  setSendTo('');
                  setSelected(nft);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#1a1a1a',
                  borderRadius: '10px',
                  padding: '8px',
                  border: '1px solid #2a2a2a',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, #4c1d95, #1e1b4b)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    position: 'relative',
                  }}
                >
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    nft.kind === 'fate'
                      ? '🍀'
                      : nft.kind === 'echo'
                        ? '⚡'
                        : nft.kind === 'rush'
                          ? '🔋'
                          : nft.kind === 'shadow'
                            ? '🌑'
                            : nft.kind === 'locksmith'
                              ? '🔓'
                              : '🎁'
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {nft.name}
                  </div>
                  <div style={{ color: '#a78bfa', fontSize: '11px', marginTop: 2 }}>
                    {nft.collection}
                    {nft.kind === 'fate'
                      ? ' · Fate'
                      : nft.kind === 'echo'
                        ? ' · Echo'
                        : nft.kind === 'rush'
                          ? ' · Rush'
                          : nft.kind === 'shadow'
                            ? ' · Shadow'
                            : nft.kind === 'locksmith'
                              ? ' · Locksmith'
                              : ''}
                    {gameplayMode &&
                    ['fate', 'echo', 'rush', 'shadow', 'locksmith'].includes(
                      String(nft.kind || '').toLowerCase(),
                    )
                      ? ` · L${getElfLevel(localInv, nft.id)}`
                      : ''}
                  </div>
                  {!gameplayMode ? (
                    <div
                      style={{
                        color: '#555',
                        fontSize: '10px',
                        marginTop: 2,
                        fontFamily: 'monospace',
                      }}
                    >
                      {nft.id.slice(0, 4)}…{nft.id.slice(-4)}
                    </div>
                  ) : null}
                </div>
                <span
                  style={{
                    color: gameplayMode ? '#c084fc' : '#ffd700',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  {gameplayMode ? `L${getElfLevel(localInv, nft.id)}` : 'View'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selected.name}
          onClick={closeDetail}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100050,
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#131517',
              border: '2px solid #9945FF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '380px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '16px',
              textAlign: 'left',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '12px',
                gap: '10px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#ffd700', fontSize: '16px' }}>
                  {selected.name}
                </h3>
                <p style={{ margin: '4px 0 0', color: '#a78bfa', fontSize: '12px' }}>
                  {gameplayMode
                    ? [
                        selected.kind === 'fate'
                          ? 'Fate'
                          : selected.kind === 'echo'
                            ? 'Echo'
                            : selected.kind === 'rush'
                              ? 'Rush'
                              : selected.kind === 'shadow'
                                ? 'Shadow'
                                : selected.kind === 'star'
                                  ? 'Star Badge'
                                  : selected.kind === 'locksmith'
                                    ? 'Locksmith'
                                    : selected.collection,
                        selected.rarity,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : `${selected.collection || ''}${selected.symbol ? ` · ${selected.symbol}` : ''}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '20px',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: '0 4px',
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'linear-gradient(145deg, #4c1d95, #0f172a)',
                border: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: gameplayMode && socketableKind ? 0 : '14px',
                position: 'relative',
              }}
            >
              {selected.image ? (
                <img
                  src={selected.image}
                  alt={selected.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span style={{ fontSize: 64 }}>
                  {selected.kind === 'fate'
                    ? '🍀'
                    : selected.kind === 'echo'
                      ? '⚡'
                      : selected.kind === 'rush'
                        ? '🔋'
                        : selected.kind === 'shadow'
                          ? '🌑'
                          : selected.kind === 'locksmith'
                            ? '🔓'
                            : '🎁'}
                </span>
              )}
            </div>

            {/* Star socket + Level — same card in Backpack AND Wallet */}
            {(socketableKind || isLocksmithSelected || isStarSelected) ? (
              <div
                style={{
                  marginTop: 12,
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #333',
                  background: '#0e0f14',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {isStarSelected ? (
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div
                      style={{
                        color: '#888',
                        fontSize: 10,
                        textTransform: 'uppercase',
                      }}
                    >
                      Level
                    </div>
                    <div
                      style={{ color: '#c084fc', fontWeight: 'bold', fontSize: 22 }}
                    >
                      L{selectedLevel}
                    </div>
                  </div>
                ) : (
                  <>
                    {socketableKind ? (
                      <button
                        type="button"
                        disabled={equipBusy}
                        onClick={() => handleStarEquip(!starEquipped)}
                        title={
                          starEquipped
                            ? 'Tap to unequip Star'
                            : freeStars > 0
                              ? 'Tap to equip Star'
                              : 'Mint a Star Badge in Shop → NFTs'
                        }
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: '50%',
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          border: starEquipped
                            ? '2px solid #ffd700'
                            : '2px solid #555',
                          background: starEquipped
                            ? 'radial-gradient(circle at 35% 30%, #fff6a8, #c9a227 45%, #5c4508)'
                            : '#16161c',
                          boxShadow: starEquipped
                            ? '0 0 16px rgba(255,215,0,0.35)'
                            : 'inset 0 0 0 6px #0a0a0e',
                          fontSize: 22,
                          padding: 0,
                          cursor: equipBusy ? 'wait' : 'pointer',
                          color: 'inherit',
                        }}
                        aria-label={starEquipped ? 'Unequip Star' : 'Equip Star'}
                      >
                        {equipBusy ? '…' : starEquipped ? '⭐' : ''}
                      </button>
                    ) : isLocksmithSelected ? (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            color: '#888',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            marginBottom: 2,
                          }}
                        >
                          Walls cleared
                        </div>
                        <div
                          style={{
                            color: climbedWalls.length ? '#14F195' : '#888',
                            fontSize: 12,
                            fontWeight: 'bold',
                            lineHeight: 1.4,
                          }}
                        >
                          {climbedWalls.length
                            ? climbedWalls.join(' · ')
                            : '—'}
                          {nextWall != null ? (
                            <span style={{ color: '#666', fontWeight: 'normal' }}>
                              {' '}
                              · next {nextWall}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div style={{ flex: 1 }} />
                    )}
                    {socketableKind ? <span style={{ flex: 1 }} /> : null}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        style={{
                          color: '#888',
                          fontSize: 10,
                          textTransform: 'uppercase',
                        }}
                      >
                        Level
                      </div>
                      <div
                        style={{
                          color: '#c084fc',
                          fontWeight: 'bold',
                          fontSize: 18,
                        }}
                      >
                        L{selectedLevel}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {/* Durability: same card in Wallet + Backpack (not on tap HUD) */}
            {selectedDurKind && selectedDurability != null ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #333',
                  background: '#0e0f14',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: '#ddd', fontSize: 12, fontWeight: 'bold' }}>
                    Durability
                  </span>
                  <span
                    style={{
                      color:
                        selectedDurability > 40
                          ? '#4ade80'
                          : selectedDurability > 15
                            ? '#fbbf24'
                            : '#f87171',
                      fontSize: 13,
                      fontWeight: 'bold',
                    }}
                  >
                    {Math.round(selectedDurability)}%
                    {selectedDurability <= 0 ? ' · OFF' : ''}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: '#1a1d24',
                    overflow: 'hidden',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, selectedDurability))}%`,
                      height: '100%',
                      background:
                        selectedDurability > 40
                          ? 'linear-gradient(90deg, #16a34a, #4ade80)'
                          : selectedDurability > 15
                            ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                            : 'linear-gradient(90deg, #b91c1c, #f87171)',
                    }}
                  />
                </div>
                <div style={{ color: '#666', fontSize: 10, marginBottom: 8, lineHeight: 1.35 }}>
                  Drains 1% / 1,000 taps · perk fully off at 0% ·{' '}
                  {NFT_DURABILITY_G2U_PER_PERCENT.toLocaleString()} $G2U = 1%
                  {' '}(+ 0.0005 SOL fee)
                </div>
                <button
                  type="button"
                  disabled={durBusy || selectedDurability >= 100}
                  onClick={() => setReloadOpen(true)}
                  style={{
                    width: '100%',
                    background:
                      selectedDurability >= 100
                        ? '#222'
                        : 'linear-gradient(90deg, #16a34a, #4ade80)',
                    border: 'none',
                    color: selectedDurability >= 100 ? '#666' : '#000',
                    borderRadius: 8,
                    padding: '10px 8px',
                    fontSize: 12,
                    fontWeight: 'bold',
                    cursor:
                      durBusy || selectedDurability >= 100 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {selectedDurability >= 100 ? 'Durability full' : 'Reload durability'}
                </button>
              </div>
            ) : null}

            {/* Wallet matches Backpack: no on-chain attributes list (guide has full traits) */}

            {selected.kind === 'shadow' ? (
              <div
                style={{
                  background: '#0c0c14',
                  border: '1px solid #a78bfa',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  disabled={equipBusy}
                  onClick={async () => {
                    setEquipBusy(true);
                    try {
                      const data = await secureShadowClaim();
                      const nextInv = data.inventory || localInv;
                      setLocalInv(nextInv);
                      if (typeof onInventoryChange === 'function') {
                        onInventoryChange(nextInv, data.player || null);
                      }
                      toast(
                        `Shadow claimed · +${data.yield ?? 0} shards (${data.hours || '?'}h of base ${data.base_cap ?? '?'})`,
                        true,
                      );
                    } catch (e) {
                      toast(e?.message || 'Claim failed', false);
                    } finally {
                      setEquipBusy(false);
                    }
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(90deg, #312e81, #6366f1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 12,
                    fontWeight: 'bold',
                    cursor: equipBusy ? 'wait' : 'pointer',
                  }}
                >
                  {equipBusy ? '…' : 'Claim Shadow daily'}
                </button>
              </div>
            ) : null}

            {gameplayMode &&
            ['fate', 'echo', 'rush', 'shadow', 'locksmith', 'star'].includes(
              String(selected.kind || '').toLowerCase(),
            ) ? (
              <button
                type="button"
                disabled={levelBusy || selectedLevelCost == null}
                onClick={() => {
                  if (levelBusy || selectedLevelCost == null) return;
                  setLevelConfirmOpen(true);
                }}
                style={{
                  width: '100%',
                  marginBottom: 12,
                  background:
                    selectedLevelCost != null
                      ? 'linear-gradient(90deg, #9945FF, #14F195)'
                      : '#222',
                  border: 'none',
                  color: selectedLevelCost != null ? '#000' : '#666',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 'bold',
                  cursor:
                    levelBusy || selectedLevelCost == null ? 'not-allowed' : 'pointer',
                }}
              >
                {levelBusy
                  ? '…'
                  : selectedLevelCost != null
                    ? useG2uLevelUp
                      ? `Level up L${selectedLevel + 1} · ${Number(selectedLevelCost).toLocaleString()} $G2U`
                      : `Level up L${selectedLevel + 1} · ${selectedLevelCost} SOL`
                    : `Max L${ELF_MAX_LEVEL}`}
              </button>
            ) : null}

            {!gameplayMode ? (
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: '10px',
                  padding: '10px',
                  marginBottom: '12px',
                }}
              >
                <div style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>
                  Mint / Asset ID
                </div>
                <div
                  style={{
                    color: '#e5e5e5',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    lineHeight: 1.4,
                  }}
                >
                  {selected.id}
                </div>
                <button
                  type="button"
                  onClick={() => copyMint(selected.id)}
                  style={{
                    marginTop: '8px',
                    background: '#222',
                    color: copied ? '#4ade80' : '#ffd700',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy address'}
                </button>
              </div>
            ) : null}

            {sendOpen ? (
              <div
                style={{
                  background: '#0c0c0c',
                  border: '1px solid #444',
                  borderRadius: '12px',
                  padding: '12px',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    color: '#ffd700',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    marginBottom: '8px',
                  }}
                >
                  Send NFT to wallet
                </div>
                <p style={{ color: '#888', fontSize: '11px', margin: '0 0 8px', lineHeight: 1.4 }}>
                  Free transfer on Solana. Needs a little SOL in this game wallet for fees.
                  Destination must be a Solana address you control (e.g. new Phantom).
                </p>
                <input
                  type="text"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="Destination wallet (base58)"
                  disabled={sending}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#1a1a1a',
                    border: '1px solid #444',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '10px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    marginBottom: '10px',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      setSendOpen(false);
                      setSendTo('');
                    }}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      color: '#aaa',
                      border: '1px solid #444',
                      borderRadius: '10px',
                      padding: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={handleSend}
                    style={{
                      flex: 1,
                      background: sending ? '#555' : '#22c55e',
                      color: '#000',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px',
                      fontWeight: 'bold',
                      cursor: sending ? 'wait' : 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {sending ? 'Sending…' : 'Confirm send'}
                  </button>
                </div>
              </div>
            ) : null}

            {!sendOpen ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSendOpen(true)}
                  style={{
                    flex: 1,
                    background: '#22c55e',
                    color: '#000',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={handleSell}
                  style={{
                    flex: 1,
                    background: '#ffd700',
                    color: '#000',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Sell
                </button>
              </div>
            ) : null}

            <p style={{ color: '#555', fontSize: '10px', margin: '10px 0 0', textAlign: 'center' }}>
              Send = free to any wallet · Sell = list on in-game market (SOL/G2U)
            </p>
          </div>
        </div>
      )}

      {levelConfirmOpen && selected && selectedLevelCost != null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm level up"
          onClick={() => !levelBusy && setLevelConfirmOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100100,
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1c1e22',
              padding: 25,
              borderRadius: 15,
              border: '2px solid #ffd700',
              textAlign: 'center',
              width: '100%',
              maxWidth: 320,
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
          >
            <h3 style={{ color: '#fff', marginTop: 0 }}>Confirm Purchase?</h3>
            <p style={{ color: '#ccc', fontSize: 14, lineHeight: 1.45 }}>
              Level up <strong style={{ color: '#ffd700' }}>{selected.name}</strong> to{' '}
              <strong style={{ color: '#14F195' }}>L{selectedLevel + 1}</strong> for{' '}
              <strong style={{ color: useG2uLevelUp ? '#fbef43' : '#14F195' }}>
                {useG2uLevelUp
                  ? `${Number(selectedLevelCost).toLocaleString()} $G2U`
                  : `${selectedLevelCost} SOL`}
              </strong>
              ?
              {useG2uLevelUp ? (
                <>
                  <br />
                  <span
                    style={{
                      fontSize: 12,
                      color: '#888',
                      display: 'block',
                      marginTop: 10,
                    }}
                  >
                    Pays {Number(selectedLevelCost).toLocaleString()} $G2U to master
                    + {ELF_LEVEL_UP_FEE_SOL} SOL treasury fee (plus network fee).
                  </span>
                </>
              ) : null}
            </p>
            <button
              type="button"
              disabled={levelBusy}
              onClick={async () => {
                setLevelConfirmOpen(false);
                await handleLevelUp();
              }}
              style={{
                width: '100%',
                background: '#ffd700',
                color: '#000',
                border: 'none',
                padding: 14,
                borderRadius: 30,
                fontWeight: 'bold',
                fontSize: 15,
                cursor: levelBusy ? 'not-allowed' : 'pointer',
                marginBottom: 10,
              }}
            >
              {levelBusy ? 'Processing…' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={levelBusy}
              onClick={() => setLevelConfirmOpen(false)}
              style={{
                width: '100%',
                background: 'transparent',
                color: '#888',
                border: '1px solid #555',
                padding: 14,
                borderRadius: 30,
                fontWeight: 'bold',
                fontSize: 14,
                cursor: levelBusy ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <DurabilityReloadModal
        open={reloadOpen && !!selectedDurKind}
        onClose={() => setReloadOpen(false)}
        onAccept={handleDurabilityReload}
        kind={selectedDurKind || 'echo'}
        currentPct={selectedDurability ?? 0}
        gftBalance={localGft}
        busy={durBusy}
      />
    </>
  );
}
