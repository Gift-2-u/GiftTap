/**
 * Gift2u Vault — G2U vault lock with Locksmith vault bonus.
 * Principal stored on player inventory (vault_gft); rewards accrue off-chain
 * until claim moves them to gft_token_balance.
 */

export const VAULT_CONFIG = {
  /** Base vault bonus % if we ever open vault without NFT (0 = Locksmith-only) */
  baseApyPercent: 0,
  /** GiftLocksmith holders */
  locksmithApyPercent: 36,
  minDeposit: 1,
  /** Only Locksmith may deposit / earn */
  locksmithOnly: true,
  secondsPerYear: 31536000,
};

/**
 * Pending rewards since last accrual timestamp.
 * @param {number} principal
 * @param {number} apyPercent
 * @param {number} lastTsMs
 * @param {number} [nowMs]
 */
export function pendingVaultRewards(principal, apyPercent, lastTsMs, nowMs = Date.now()) {
  const p = Number(principal) || 0;
  const apy = Number(apyPercent) || 0;
  const last = Number(lastTsMs) || 0;
  if (p <= 0 || apy <= 0 || !last) return 0;
  const elapsed = Math.max(0, (nowMs - last) / 1000);
  const raw = p * (apy / 100) * (elapsed / VAULT_CONFIG.secondsPerYear);
  return Math.round(raw * 1e6) / 1e6;
}

export function vaultApyForHolder(hasLocksmithNft) {
  return hasLocksmithNft
    ? VAULT_CONFIG.locksmithApyPercent
    : VAULT_CONFIG.baseApyPercent;
}

/** Read vault fields from inventory */
export function readVaultState(inventory = {}) {
  const inv = inventory || {};
  return {
    principal: Number(inv.vault_gft) || 0,
    lastTs: Number(inv.vault_last_ts) || 0,
  };
}

/**
 * Crystallize rewards into claimable, return new inventory + amounts.
 * Rewards are NOT auto-added to principal (user claims to wallet G2U credit).
 */
export function crystallizeVault(inventory, hasLocksmithNft, nowMs = Date.now()) {
  const { principal, lastTs } = readVaultState(inventory);
  const apy = vaultApyForHolder(hasLocksmithNft);
  const pending = pendingVaultRewards(principal, apy, lastTs || nowMs, nowMs);
  const inv = { ...(inventory || {}) };
  inv.vault_gft = principal;
  inv.vault_last_ts = nowMs;
  inv.vault_pending_gft =
    Math.round(((Number(inv.vault_pending_gft) || 0) + pending) * 1e6) / 1e6;
  return {
    inventory: inv,
    principal,
    justEarned: pending,
    pendingTotal: Number(inv.vault_pending_gft) || 0,
    apy,
  };
}

export function inventoryAfterVaultDeposit(inventory, amount, hasLocksmithNft, nowMs = Date.now()) {
  const c = crystallizeVault(inventory, hasLocksmithNft, nowMs);
  const inv = c.inventory;
  inv.vault_gft = Math.round((c.principal + Number(amount)) * 1e6) / 1e6;
  inv.vault_last_ts = nowMs;
  return inv;
}

export function inventoryAfterVaultWithdraw(inventory, amount, hasLocksmithNft, nowMs = Date.now()) {
  const c = crystallizeVault(inventory, hasLocksmithNft, nowMs);
  const inv = c.inventory;
  const take = Math.min(Number(amount), c.principal);
  inv.vault_gft = Math.round((c.principal - take) * 1e6) / 1e6;
  inv.vault_last_ts = nowMs;
  return { inventory: inv, withdrawn: take, pendingTotal: c.pendingTotal };
}

export function inventoryAfterVaultClaim(inventory, hasLocksmithNft, nowMs = Date.now()) {
  const c = crystallizeVault(inventory, hasLocksmithNft, nowMs);
  const inv = c.inventory;
  const claim = Number(inv.vault_pending_gft) || 0;
  inv.vault_pending_gft = 0;
  inv.vault_last_ts = nowMs;
  return { inventory: inv, claimed: claim, principal: c.principal };
}
