import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import {
  DB_PLAYER_ID,
  getPlayerId,
  isLoggedIn,
  getPlayerProfile,
} from './playerIdentity';
import { hasLocksmith } from './locksmith';
import {
  VAULT_CONFIG,
  vaultApyForHolder,
  readVaultState,
  pendingVaultRewards,
  inventoryAfterVaultDeposit,
  inventoryAfterVaultWithdraw,
  inventoryAfterVaultClaim,
} from './vault';
import AppNotice from './AppNotice';
import WalletHub from './WalletHub';

/**
 * Main-site G2U Vault (gift2u.fun/vault).
 * Yield for GiftLocksmith holders on G2U credit (game account).
 */
export default function VaultPage() {
  const playerId = getPlayerId();
  const loggedIn = isLoggedIn() && !!playerId;
  const profile = getPlayerProfile();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [walletHubOpen, setWalletHubOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [gftLiquid, setGftLiquid] = useState(0);
  const [inventory, setInventory] = useState({});
  const [isLocksmith, setIsLocksmith] = useState(false);
  const [amount, setAmount] = useState('');
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState({
    show: false,
    message: '',
    success: null,
  });

  const notify = (message, success = null) =>
    setNotice({ show: true, message: String(message), success });

  const load = useCallback(async () => {
    if (!playerId || !loggedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('players')
        .select('wallet_address, gft_token_balance, inventory, username')
        .eq(DB_PLAYER_ID, String(playerId))
        .maybeSingle();
      if (error) throw error;
      const inv = data?.inventory || {};
      setInventory(inv);
      setGftLiquid(Number(data?.gft_token_balance) || 0);
      const addr = data?.wallet_address || '';
      setWalletAddress(addr);
      if (addr) {
        setIsLocksmith(await hasLocksmith(addr));
      } else {
        setIsLocksmith(false);
      }
    } catch (e) {
      console.error(e);
      notify(e?.message || 'Failed to load vault', false);
    } finally {
      setLoading(false);
    }
  }, [playerId, loggedIn]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { principal, lastTs } = useMemo(
    () => readVaultState(inventory),
    [inventory],
  );
  const apy = vaultApyForHolder(isLocksmith);
  const livePending = useMemo(() => {
    const basePending = Number(inventory.vault_pending_gft) || 0;
    const since =
      principal > 0 && lastTs
        ? pendingVaultRewards(principal, apy, lastTs, now)
        : 0;
    return Math.round((basePending + since) * 1e6) / 1e6;
  }, [inventory, principal, lastTs, apy, now]);

  const savePlayer = async (patch) => {
    const { error } = await supabase
      .from('players')
      .update({ ...patch, last_updated: new Date().toISOString() })
      .eq(DB_PLAYER_ID, String(playerId));
    if (error) throw error;
  };

  const handleDeposit = async () => {
    const amt = Number(amount);
    if (!isLocksmith) {
      notify('GiftLocksmith NFT required to deposit in the vault.', false);
      return;
    }
    if (!Number.isFinite(amt) || amt < VAULT_CONFIG.minDeposit) {
      notify(`Minimum deposit is ${VAULT_CONFIG.minDeposit} G2U.`, false);
      return;
    }
    if (amt > gftLiquid) {
      notify('Not enough G2U credit. Swap G2Ushards → G2U in the game wallet first.', false);
      return;
    }
    setBusy(true);
    try {
      const nextInv = inventoryAfterVaultDeposit(inventory, amt, isLocksmith);
      const nextLiquid = Math.round((gftLiquid - amt) * 1e6) / 1e6;
      await savePlayer({
        gft_token_balance: nextLiquid,
        inventory: nextInv,
      });
      setInventory(nextInv);
      setGftLiquid(nextLiquid);
      setAmount('');
      notify(`Deposited ${amt} G2U into the vault.`, true);
    } catch (e) {
      notify(e?.message || 'Deposit failed', false);
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      notify('Enter an amount to withdraw.', false);
      return;
    }
    if (amt > principal) {
      notify('Not enough principal in vault.', false);
      return;
    }
    setBusy(true);
    try {
      const { inventory: nextInv, withdrawn } = inventoryAfterVaultWithdraw(
        inventory,
        amt,
        isLocksmith,
      );
      const nextLiquid = Math.round((gftLiquid + withdrawn) * 1e6) / 1e6;
      await savePlayer({
        gft_token_balance: nextLiquid,
        inventory: nextInv,
      });
      setInventory(nextInv);
      setGftLiquid(nextLiquid);
      setAmount('');
      notify(`Withdrew ${withdrawn} G2U to your balance.`, true);
    } catch (e) {
      notify(e?.message || 'Withdraw failed', false);
    } finally {
      setBusy(false);
    }
  };

  const handleClaim = async () => {
    if (livePending <= 0) {
      notify('No rewards to claim yet.', false);
      return;
    }
    setBusy(true);
    try {
      const { inventory: nextInv, claimed } = inventoryAfterVaultClaim(
        inventory,
        isLocksmith,
      );
      const nextLiquid = Math.round((gftLiquid + claimed) * 1e6) / 1e6;
      await savePlayer({
        gft_token_balance: nextLiquid,
        inventory: nextInv,
      });
      setInventory(nextInv);
      setGftLiquid(nextLiquid);
      notify(`Claimed ${claimed} G2U rewards.`, true);
    } catch (e) {
      notify(e?.message || 'Claim failed', false);
    } finally {
      setBusy(false);
    }
  };

  const card =
    'rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:p-6 shadow-xl';

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-950 text-white px-4 py-8 sm:px-6">
      <AppNotice
        show={notice.show}
        message={notice.message}
        success={notice.success}
        onClose={() => setNotice((n) => ({ ...n, show: false }))}
      />
      <WalletHub
        isOpen={walletHubOpen}
        onClose={() => {
          setWalletHubOpen(false);
          load();
        }}
        defaultTab="game"
        overlayStyle={{ zIndex: 100000 }}
        useSharedGameWallet
      />

      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
            Gift2u · Main site
          </p>
          <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-yellow-300">
            G2U Vault
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Lock G2U in the vault. GiftLocksmith holders get{' '}
            <span className="text-yellow-400 font-bold">
              {VAULT_CONFIG.locksmithApyPercent}% vault bonus
            </span>
            . Deposit from your game wallet G2U balance (swap shards in Play first).
          </p>
        </div>

        {!loggedIn ? (
          <div className={card + ' text-center space-y-4'}>
            <p className="text-slate-300 text-sm">
              Log in with your Gift Tap account to use the vault.
            </p>
            <button
              type="button"
              onClick={() => setWalletHubOpen(true)}
              className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 font-bold py-3"
            >
              Open Wallet / Log in
            </button>
            <Link to="/play" className="block text-sm text-yellow-400 hover:underline">
              Or open Gift Tap →
            </Link>
          </div>
        ) : loading ? (
          <div className={card + ' text-center text-slate-400'}>Loading vault…</div>
        ) : (
          <>
            {/* Access card */}
            <div
              className={
                card +
                (isLocksmith
                  ? ' border-purple-500/40'
                  : ' border-amber-500/30')
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Access</p>
                  <p className="text-lg font-bold mt-1">
                    {isLocksmith ? (
                      <span className="text-purple-300">GiftLocksmith active</span>
                    ) : (
                      <span className="text-amber-300">Locksmith required</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 break-all">
                    {walletAddress
                      ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-6)}`
                      : 'No game wallet yet — open Play once'}
                  </p>
                </div>
                <img
                  src="/Gift2u_logo.png"
                  alt=""
                  className="w-12 h-12 object-contain opacity-90"
                />
              </div>
              {!isLocksmith && (
                <div className="mt-4 rounded-xl bg-black/40 border border-white/10 p-3 text-sm text-slate-300 space-y-2">
                  <p>
                    Mint <strong className="text-yellow-400">GiftLocksmith</strong> in
                    Gift Tap → Shop → <strong>NFTs</strong> (0.25 SOL Wave 1) to unlock
                    vault deposits and {VAULT_CONFIG.locksmithApyPercent}% vault bonus.
                  </p>
                  <Link
                    to="/play"
                    className="inline-block font-bold text-purple-400 hover:text-purple-300"
                  >
                    Go to Play / Shop →
                  </Link>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className={card}>
                <p className="text-xs text-slate-500">Liquid G2U</p>
                <p className="text-2xl font-black text-sky-300 mt-1">
                  {gftLiquid.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </p>
              </div>
              <div className={card}>
                <p className="text-xs text-slate-500">In vault</p>
                <p className="text-2xl font-black text-yellow-300 mt-1">
                  {principal.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </p>
              </div>
              <div className={card}>
                <p className="text-xs text-slate-500">Vault bonus</p>
                <p className="text-2xl font-black text-purple-300 mt-1">
                  {isLocksmith ? `${apy}%` : '—'}
                </p>
              </div>
              <div className={card}>
                <p className="text-xs text-slate-500">Pending rewards</p>
                <p className="text-2xl font-black text-emerald-300 mt-1">
                  {livePending.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className={card + ' space-y-4'}>
              <label className="block text-xs font-bold text-slate-400 uppercase">
                Amount (G2U)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl bg-black/50 border border-white/15 px-4 py-3 text-lg font-bold text-white outline-none focus:border-purple-400"
              />
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-purple-400 font-bold"
                  onClick={() => setAmount(String(gftLiquid))}
                >
                  Max liquid
                </button>
                <span className="text-slate-600">·</span>
                <button
                  type="button"
                  className="text-yellow-400 font-bold"
                  onClick={() => setAmount(String(principal))}
                >
                  Max vault
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy || !isLocksmith}
                  onClick={handleDeposit}
                  className="rounded-xl bg-gradient-to-r from-purple-600 to-violet-500 font-bold py-3 disabled:opacity-40"
                >
                  Deposit
                </button>
                <button
                  type="button"
                  disabled={busy || principal <= 0}
                  onClick={handleWithdraw}
                  className="rounded-xl bg-slate-700 hover:bg-slate-600 font-bold py-3 disabled:opacity-40"
                >
                  Withdraw
                </button>
              </div>
              <button
                type="button"
                disabled={busy || livePending <= 0}
                onClick={handleClaim}
                className="w-full rounded-xl border border-emerald-500/50 text-emerald-300 font-bold py-3 disabled:opacity-40"
              >
                Claim rewards → liquid G2U
              </button>
            </div>

            <p className="text-center text-sm text-slate-400">
              Looking for on-chain G2U staking?{" "}
              <Link to="/stake" className="text-purple-400 font-bold hover:underline">
                Open Stake →
              </Link>
            </p>
            <p className="text-center text-xs text-slate-500 leading-relaxed px-2">
              Logged in as{' '}
              <span className="text-slate-300">
                {profile.username || 'Player'}
              </span>
              . Vault uses app G2U credit (not on-chain SPL until token launch).
              Rates and eligibility may change — see Terms.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
