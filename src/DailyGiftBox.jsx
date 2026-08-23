import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import giftLogo from './components/Gift2u_logo.png';
import { getPlayerId, isLoggedIn } from './playerIdentity';
import {
  hasSecureSession,
  ensureSecureSession,
  fetchPlayerState,
  secureMysteryOpen,
} from './secureApi';
import {
  BADGE_TIERS,
  MYSTERY_BOX_COSTS,
  getBadgeCounts,
  canOpenMysteryWith,
} from './weeklyBadges';
import { applyServerInventoryAuthority, getUtcWeekId } from './weeklyQuestLogic';

/**
 * Homepage hero gift — Mystery Gift ceremony (not mining taps).
 * Flow: click gift → choose badge burn → shake → “You won …”
 */
const DailyGiftBox = () => {
  const [phase, setPhase] = useState('idle'); // idle | pick | shaking | reveal
  const [inventory, setInventory] = useState({});
  const [loadingInv, setLoadingInv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedTier, setSelectedTier] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [isPressed, setIsPressed] = useState(false);

  const loggedIn = isLoggedIn() && !!getPlayerId();
  const sessionOk = hasSecureSession();

  const badgeCounts = useMemo(() => getBadgeCounts(inventory), [inventory]);
  const eligibleTiers = useMemo(
    () =>
      Object.keys(MYSTERY_BOX_COSTS).filter((t) =>
        canOpenMysteryWith(inventory, t),
      ),
    [inventory],
  );

  const refreshInventory = useCallback(async () => {
    if (!getPlayerId()) {
      setInventory({});
      return;
    }
    setLoadingInv(true);
    setError('');
    try {
      await ensureSecureSession();
      const data = await fetchPlayerState();
      const inv = data?.player?.inventory || data?.inventory || {};
      setInventory(inv && typeof inv === 'object' ? inv : {});
    } catch (e) {
      console.warn('mystery home inv', e);
      setError(e?.message || 'Could not load badges');
    } finally {
      setLoadingInv(false);
    }
  }, []);

  useEffect(() => {
    if (loggedIn) refreshInventory();
  }, [loggedIn, refreshInventory]);

  const openPicker = useCallback(async () => {
    setError('');
    setReveal(null);
    if (!loggedIn || !sessionOk) {
      setPhase('need_login');
      return;
    }
    setBusy(true);
    try {
      await refreshInventory();
      setPhase('pick');
      setSelectedTier(null);
    } finally {
      setBusy(false);
    }
  }, [loggedIn, sessionOk, refreshInventory]);

  // Shop “Go to homepage gift” links here with ?mystery=1
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('mystery') === '1') {
        openPicker();
        q.delete('mystery');
        const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', next);
      }
    } catch {
      /* ignore */
    }
  }, [openPicker]);

  const runOpen = async (tier) => {
    if (!tier || busy) return;
    setBusy(true);
    setError('');
    setSelectedTier(tier);
    setPhase('shaking');
    try {
      await ensureSecureSession();
      // Let shake play ~1.1s then reveal
      const [data] = await Promise.all([
        secureMysteryOpen(tier),
        new Promise((r) => setTimeout(r, 1100)),
      ]);
      const reward = data?.reward || {};
      const dest = reward.dest || data?.dest || 'backpack';
      const destLine =
        dest === 'wallet'
          ? 'Reserved for SPL $G2U to your game wallet'
          : dest === 'wallet_nft'
            ? 'Queued for mint to your game wallet'
            : dest === 'balance'
              ? 'Added to your G2Ushards balance'
              : 'Added to Backpack — open Gift Tap → Pack';
      setReveal({
        tier,
        label: reward.label || 'Mystery prize',
        destLine,
        prizeId: reward.prizeId || '',
      });
      if (data?.inventory) {
        // Badge burns must clear deleted keys (don't merge with stale prev stacks)
        setInventory(
          applyServerInventoryAuthority({}, data.inventory, getUtcWeekId()),
        );
      }
      setPhase('reveal');
    } catch (e) {
      console.error('mystery home open', e);
      setError(e?.message || 'Could not open Mystery Gift');
      setPhase('pick');
    } finally {
      setBusy(false);
    }
  };

  const closeAll = () => {
    setPhase('idle');
    setSelectedTier(null);
    setReveal(null);
    setError('');
    setIsPressed(false);
  };

  return (
    <div className="mt-2 p-4 w-full max-w-md mx-auto flex flex-col items-center">
      {/* THE GIFT ZONE */}
      <div
        className="relative flex justify-center items-center w-full min-h-[300px] mt-8 mb-4"
        style={{ cursor: 'pointer' }}
        onPointerDown={() => setIsPressed(true)}
        onPointerUp={() => setIsPressed(false)}
        onPointerLeave={() => setIsPressed(false)}
        onClick={() => {
          if (phase === 'idle' || phase === 'need_login') openPicker();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openPicker();
        }}
        aria-label="Open Mystery Gift"
      >
        {/* Pulsing halo */}
        <motion.div
          animate={{
            scale: [1, 1.12, 1],
            opacity: [0.35, 0.55, 0.35],
          }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: '260px',
            height: '260px',
            background:
              'radial-gradient(circle, rgba(168, 85, 247, 0.45) 0%, rgba(255, 215, 0, 0.15) 45%, transparent 70%)',
            zIndex: 0,
            borderRadius: '50%',
          }}
        />

        {/* Sparkles while shaking / reveal */}
        {(phase === 'shaking' || phase === 'reveal') &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0.4, 1.2, 0.2],
                x: [0, (i % 2 === 0 ? 1 : -1) * (40 + i * 18)],
                y: [0, -50 - i * 12, -20],
              }}
              transition={{
                duration: 1.1,
                repeat: phase === 'shaking' ? Infinity : 0,
                delay: i * 0.12,
              }}
              style={{
                position: 'absolute',
                zIndex: 6,
                fontSize: 18 + (i % 3) * 4,
                pointerEvents: 'none',
              }}
            >
              {i % 2 === 0 ? '✨' : '⭐'}
            </motion.span>
          ))}

        <motion.div
          animate={
            phase === 'shaking'
              ? {
                  rotate: [-10, 12, -14, 14, -8, 8, 0],
                  y: [0, -18, 6, -22, 0],
                  scale: [1, 1.08, 0.94, 1.12, 1],
                  transition: { duration: 1.1, ease: 'easeInOut' },
                }
              : phase === 'reveal'
                ? {
                    y: -28,
                    scale: 1.06,
                    rotate: 0,
                    transition: { type: 'spring', stiffness: 220, damping: 14 },
                  }
                : isPressed
                  ? { scale: 0.93, y: 4 }
                  : {
                      y: [0, -14, 0],
                      rotate: [-2.5, 2.5, -2.5],
                      scale: [1, 1.03, 1],
                      transition: {
                        duration: 3.2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      },
                    }
          }
          style={{ zIndex: 5, position: 'relative' }}
        >
          {/* “Lid lift” illusion on open */}
          <motion.div
            animate={
              phase === 'reveal'
                ? { y: -36, rotate: -12, opacity: 0.95 }
                : phase === 'shaking'
                  ? { y: [-2, 4, -6, 0], rotate: [0, -4, 4, 0] }
                  : { y: 0, rotate: 0 }
            }
            transition={{ duration: phase === 'reveal' ? 0.55 : 0.35 }}
            style={{ originX: 0.5, originY: 1 }}
          >
            <img
              src={giftLogo}
              alt="Mystery Gift"
              onDragStart={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                width: '280px',
                height: 'auto',
                filter:
                  isPressed || phase === 'shaking' || phase === 'reveal'
                    ? 'drop-shadow(0 0 32px rgba(255, 215, 0, 1)) brightness(1.15)'
                    : 'drop-shadow(0 0 16px rgba(255, 215, 0, 0.55))',
                transition: 'filter 0.2s ease-out',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            />
          </motion.div>
        </motion.div>
      </div>

      <h3 className="text-xl font-bold mb-2 mt-2 text-yellow-300">
        Mystery Gift
      </h3>
      <p className="text-slate-400 text-sm mb-2 text-center leading-relaxed px-2">
        Tap the gift · burn weekly badges · win boosts, G2Ushards, G2U, or an NFT
      </p>
      {(busy || phase === 'shaking') && (
        <p className="text-purple-300 text-xs font-bold mb-4 tracking-widest">
          OPENING…
        </p>
      )}

      {/* Overlay flows */}
      <AnimatePresence>
        {(phase === 'need_login' ||
          phase === 'pick' ||
          phase === 'shaking' ||
          phase === 'reveal') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100080] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.88)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget && phase !== 'shaking') closeAll();
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl border-2 border-yellow-400/80 p-6 text-center shadow-[0_0_40px_rgba(255,215,0,0.25)]"
              style={{
                background:
                  'linear-gradient(165deg, #1a1520 0%, #0f172a 65%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {phase === 'need_login' && (
                <>
                  <div className="text-4xl mb-3">🎁</div>
                  <h3 className="text-yellow-300 text-xl font-black mb-2">
                    Burn badges to open
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-5">
                    Mystery Gift uses your Gift Tap weekly badges. Log in to Gift
                    Tap first, earn badges on the weekly board, then come back and
                    tap this gift.
                  </p>
                  <Link
                    to="/play"
                    className="block w-full py-3 rounded-xl font-bold text-black bg-gradient-to-r from-yellow-300 to-amber-500 mb-3"
                    onClick={closeAll}
                  >
                    Open Gift Tap
                  </Link>
                  <button
                    type="button"
                    onClick={closeAll}
                    className="w-full py-3 rounded-xl font-bold text-white bg-slate-700 border border-slate-600"
                  >
                    Close
                  </button>
                </>
              )}

              {phase === 'pick' && (
                <>
                  <div className="text-4xl mb-2">🔥</div>
                  <h3 className="text-yellow-300 text-xl font-black mb-1">
                    Burn badges to open
                  </h3>
                  <p className="text-slate-400 text-xs mb-4">
                    Choose which badge tier to burn. Better badges = better odds.
                  </p>
                  {loadingInv ? (
                    <p className="text-slate-400 text-sm py-6">Loading badges…</p>
                  ) : eligibleTiers.length === 0 ? (
                    <>
                      <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                        You don’t have enough badges yet. Earn weekly ranks in Gift
                        Tap, then return here.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-4 text-left text-[11px] text-slate-500">
                        {Object.keys(MYSTERY_BOX_COSTS).map((t) => (
                          <div
                            key={t}
                            className="rounded-lg border border-slate-700 px-2 py-2"
                          >
                            <span style={{ color: BADGE_TIERS[t]?.color }}>
                              {BADGE_TIERS[t]?.emoji} {BADGE_TIERS[t]?.name}
                            </span>
                            <div>
                              need {MYSTERY_BOX_COSTS[t]} · have{' '}
                              {badgeCounts[t] || 0}
                            </div>
                          </div>
                        ))}
                      </div>
                      <Link
                        to="/play"
                        className="block w-full py-3 rounded-xl font-bold text-black bg-gradient-to-r from-yellow-300 to-amber-500 mb-2"
                        onClick={closeAll}
                      >
                        Play Gift Tap
                      </Link>
                    </>
                  ) : (
                    <div className="flex flex-col gap-2 mb-4">
                      {eligibleTiers.map((t) => {
                        const meta = BADGE_TIERS[t];
                        const need = MYSTERY_BOX_COSTS[t];
                        const have = badgeCounts[t] || 0;
                        return (
                          <button
                            key={t}
                            type="button"
                            disabled={busy}
                            onClick={() => runOpen(t)}
                            className="flex items-center gap-3 w-full rounded-xl border px-3 py-3 text-left hover:bg-white/5 transition"
                            style={{ borderColor: meta.color }}
                          >
                            {meta.image ? (
                              <img
                                src={meta.image}
                                alt=""
                                className="w-10 h-10 object-contain rounded-lg bg-black"
                              />
                            ) : (
                              <span className="text-2xl">{meta.emoji}</span>
                            )}
                            <span className="flex-1 min-w-0">
                              <span
                                className="block font-bold text-sm"
                                style={{ color: meta.color }}
                              >
                                Burn {need} {meta.name.replace(' Badge', '')}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                You have {have}
                              </span>
                            </span>
                            <span className="text-yellow-300 font-black text-xs">
                              OPEN →
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {error ? (
                    <p className="text-amber-300 text-xs mb-3">{error}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeAll}
                    className="w-full py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600"
                  >
                    Cancel
                  </button>
                </>
              )}

              {phase === 'shaking' && (
                <>
                  <motion.div
                    animate={{ rotate: [-12, 12, -14, 14, 0], scale: [1, 1.1, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-6xl mb-4"
                  >
                    🎁
                  </motion.div>
                  <h3 className="text-yellow-300 text-xl font-black mb-2">
                    Opening…
                  </h3>
                  <p className="text-slate-400 text-sm">
                    Burning{' '}
                    {BADGE_TIERS[selectedTier]?.name || selectedTier}
                    …
                  </p>
                </>
              )}

              {phase === 'reveal' && reveal && (
                <>
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-5xl mb-3"
                  >
                    ✨🎁✨
                  </motion.div>
                  <h3 className="text-yellow-300 text-2xl font-black mb-2">
                    You won…
                  </h3>
                  <p className="text-white font-bold text-base leading-snug mb-3 px-1">
                    {reveal.label}
                  </p>
                  <p className="text-emerald-400 text-sm mb-5 leading-relaxed">
                    {reveal.destLine}
                  </p>
                  <button
                    type="button"
                    onClick={closeAll}
                    className="w-full py-3.5 rounded-xl font-black text-black bg-gradient-to-r from-yellow-300 to-amber-500"
                  >
                    Awesome!
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DailyGiftBox;
