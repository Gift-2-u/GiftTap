import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  TERMS_BODY,
  PRIVACY_BODY,
  TERMS_TITLE,
  PRIVACY_TITLE,
} from './legalContent';

/**
 * Public legal pages for Solana dApp Store / SEO.
 * Routes: /terms , /privacy
 */
export default function LegalPage({ kind: kindProp }) {
  const params = useParams();
  const kind = kindProp || params.kind || 'terms';
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? PRIVACY_TITLE : TERMS_TITLE;
  const body = isPrivacy ? PRIVACY_BODY : TERMS_BODY;

  return (
    <main className="w-full flex-grow max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 text-left">
      <p className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-2">
        Gift2u · Legal
      </p>
      <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">{title}</h1>
      <p className="text-sm text-slate-400 mb-8">
        <Link to="/" className="text-purple-400 hover:underline">
          Home
        </Link>
        {' · '}
        <Link
          to="/terms"
          className={!isPrivacy ? 'text-yellow-400 font-bold' : 'text-purple-400 hover:underline'}
        >
          Terms of Use
        </Link>
        {' · '}
        <Link
          to="/privacy"
          className={isPrivacy ? 'text-yellow-400 font-bold' : 'text-purple-400 hover:underline'}
        >
          Privacy Policy
        </Link>
        {' · '}
        <Link to="/play" className="text-purple-400 hover:underline">
          Play Gift Tap
        </Link>
      </p>

      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:p-8 shadow-xl">
        <p className="text-xs text-slate-500 italic mb-6">
          This page is publicly available so users and app stores can read our policies before using
          Gift2u / Gift Tap. It is not a substitute for advice from a licensed attorney.
        </p>
        <div className="text-slate-300 text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">
          {body}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Questions? Use official channels linked from gift2u.fun
      </p>
    </main>
  );
}
