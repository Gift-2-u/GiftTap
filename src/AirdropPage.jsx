import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { getPlayerId, isLoggedIn, DB_PLAYER_ID } from './playerIdentity';
import { hasLocksmith } from './locksmith';
import {
  AIRDROP_META,
  computeAirdropProgress,
  fetchAirdropInputs,
} from './airdropProgress';
import AirdropBoard from './AirdropBoard';

/**
 * Public site: gift2u.fun/airdrop
 */
export default function AirdropPage() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (!isLoggedIn() || !getPlayerId()) {
          if (!cancelled) {
            setProgress(null);
            setLoading(false);
          }
          return;
        }
        const pid = getPlayerId();
        const raw = await fetchAirdropInputs(supabase, pid, DB_PLAYER_ID);
        if (cancelled) return;
        if (!raw) {
          setError('Could not load your player data.');
          setProgress(null);
          setLoading(false);
          return;
        }
        let hasNft = false;
        if (raw.walletAddress) {
          try {
            hasNft = await hasLocksmith(raw.walletAddress);
          } catch {
            hasNft = false;
          }
        }
        if (cancelled) return;
        setUsername(raw.username || '');
        setProgress(
          computeAirdropProgress({
            lifetimeTaps: raw.lifetimeTaps,
            maxUnlockedLevel: raw.maxUnlockedLevel,
            streak: raw.streak,
            hasIap: raw.hasIap,
            completedTasks: raw.completedTasks || [],
            hasNft,
            friendsTaps1000: raw.friendsTaps1000,
            friendsL5: raw.friendsL5,
          }),
        );
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load board');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="w-full flex-grow flex flex-col items-center py-12 sm:py-16 px-4 sm:px-6 overflow-x-hidden">
      <div className="w-full max-w-xl">
        {loading ? (
          <p className="text-slate-400 text-center py-16">Loading airdrop board…</p>
        ) : (
          <>
            <AirdropBoard progress={progress} username={username} />
            {error ? (
              <p className="text-red-400 text-center text-sm mt-4">{error}</p>
            ) : null}
            {!progress && !error ? (
              <div className="mt-6 text-center space-y-3">
                <p className="text-slate-400 text-sm">
                  Log in to Gift Tap to see your personal checkmarks and bonus %.
                </p>
                <Link
                  to="/play"
                  className="inline-block bg-yellow-400 text-black font-black px-8 py-3 rounded-full hover:bg-yellow-300"
                >
                  Play Gift Tap
                </Link>
              </div>
            ) : null}
            {progress ? (
              <div className="mt-8 text-center">
                <Link
                  to="/play"
                  className="text-purple-400 hover:text-purple-300 font-bold text-sm"
                >
                  ← Back to game
                </Link>
              </div>
            ) : null}
          </>
        )}

        {/* Rules summary for everyone */}
        <section className="mt-12 rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:p-6 text-left">
          <h2 className="text-lg font-black text-white mb-3">How it works</h2>
          <ul className="text-sm text-slate-400 space-y-2 list-disc pl-5 leading-relaxed">
            <li>
              <strong className="text-yellow-300">Level 5 wall</strong> = base airdrop ticket. You can
              earn checkmarks and % before L5; share stays <strong className="text-slate-300">0</strong>{' '}
              until you clear it.
            </li>
            <li>Bonuses stack across categories; within level / taps / streak only the highest tier counts.</li>
            <li>
              Streaks use your <strong className="text-slate-300">current UTC streak</strong> — same as when
              Claim unlocks on 14-day and 30-day Tasks.
            </li>
            <li>Lifetime taps (all-time mined), not spendable balance.</li>
            <li>NFT = GiftLocksmith in your game wallet. IAP = any recorded in-app purchase.</li>
            <li>
              Friends: 3 referrals with 1,000+ lifetime taps (+5%), 3 who cleared L5 (+10%).
            </li>
          </ul>
          <p className="text-xs text-slate-600 mt-4">{AIRDROP_META.disclaimer}</p>
        </section>
      </div>
    </main>
  );
}
