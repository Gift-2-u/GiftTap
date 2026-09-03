import React from 'react';
import { Link } from 'react-router-dom';
import { isLoggedIn } from './playerIdentity';

/**
 * Public account-deletion instructions for Play Console / privacy.
 * URL: https://gift2u.fun/delete-account
 */
export default function DeleteAccountPage() {
  const loggedIn = typeof window !== 'undefined' && isLoggedIn();

  return (
    <main className="w-full flex-grow max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 text-left">
      <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">
        Gift2u · Account
      </p>
      <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
        Delete your Gift Tap account
      </h1>
      <p className="text-sm text-slate-400 mb-8">
        <Link to="/" className="text-purple-400 hover:underline">
          Home
        </Link>
        {' · '}
        <Link to="/privacy" className="text-purple-400 hover:underline">
          Privacy Policy
        </Link>
        {' · '}
        <Link to="/play" className="text-purple-400 hover:underline">
          Play Gift Tap
        </Link>
      </p>

      <div className="rounded-2xl border border-red-500/30 bg-slate-900/80 p-5 sm:p-8 shadow-xl space-y-6">
        <p className="text-slate-300 text-sm sm:text-[15px] leading-relaxed">
          You can permanently delete your Gift Tap account yourself. This removes
          your game profile and login from our servers. Use this page for Google
          Play / privacy requests, or open the in-app button below.
        </p>

        <div>
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Steps</h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm sm:text-[15px] leading-relaxed">
            <li>
              Open{' '}
              <Link to="/play" className="text-purple-400 hover:underline font-semibold">
                Gift Tap
              </Link>{' '}
              and log in with your username and password.
            </li>
            <li>
              Tap the <strong className="text-white">menu</strong> (☰), then{' '}
              <strong className="text-white">Settings</strong>.
            </li>
            <li>
              Tap <strong className="text-red-400">Delete my account</strong>.
            </li>
            <li>
              Type your <strong className="text-white">username</strong> to confirm,
              enter your <strong className="text-white">password</strong>, then
              confirm deletion.
            </li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            You must have a password set first (Settings → Set / Change username &amp;
            password). If you only use 12-word restore, set a password before deleting.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-yellow-400 mb-3">
            What we delete
          </h2>
          <ul className="list-disc list-inside space-y-1.5 text-slate-300 text-sm sm:text-[15px]">
            <li>Your Gift Tap profile (username, progress, inventory, scores)</li>
            <li>Login password and encrypted vault backup on our servers</li>
            <li>Active sessions and in-app notices</li>
            <li>Leaderboard / score ledger rows for your account</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-bold text-yellow-400 mb-3">
            What we cannot delete
          </h2>
          <ul className="list-disc list-inside space-y-1.5 text-slate-300 text-sm sm:text-[15px]">
            <li>
              <strong className="text-white">On-chain</strong> SOL, $G2U tokens, and
              NFTs already in your Solana wallet — those stay on the blockchain
            </li>
            <li>
              Records we must keep briefly for security, fraud prevention, or law
              (if any)
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            to={loggedIn ? '/play?delete=1' : '/play'}
            className="inline-flex justify-center items-center rounded-xl bg-red-500 hover:bg-red-400 text-black font-bold px-5 py-3.5 text-sm sm:text-base transition-colors"
          >
            {loggedIn
              ? 'Open Delete account in Gift Tap'
              : 'Open Gift Tap to log in & delete'}
          </Link>
          <Link
            to="/privacy"
            className="inline-flex justify-center items-center rounded-xl border border-white/20 hover:border-purple-400 text-slate-200 font-semibold px-5 py-3.5 text-sm sm:text-base transition-colors"
          >
            Read Privacy Policy
          </Link>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Direct link for stores and support:{' '}
          <a
            href="https://gift2u.fun/delete-account"
            className="text-purple-400 hover:underline break-all"
          >
            https://gift2u.fun/delete-account
          </a>
        </p>
      </div>
    </main>
  );
}
