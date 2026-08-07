import React from 'react';
import { Link } from 'react-router-dom';
import {
  ROADMAP_META,
  ROADMAP_PHASES,
  STATUS_COLOR,
  STATUS_LABEL,
} from './roadmapContent';

/**
 * Public website page: gift2u.fun/roadmap
 * Edit copy in roadmapContent.js
 */
export default function RoadmapPage() {
  return (
    <main className="w-full flex-grow flex flex-col items-center py-12 sm:py-16 px-4 sm:px-6 text-left overflow-x-hidden">
      <div className="w-full max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-purple-400 text-center">
          Gift2u · Roadmap
        </p>
        <h1 className="mt-2 text-3xl sm:text-5xl font-black text-center bg-gradient-to-r from-purple-400 to-yellow-300 bg-clip-text text-transparent">
          {ROADMAP_META.title}
        </h1>
        <p className="mt-4 text-sm sm:text-base text-slate-400 text-center leading-relaxed">
          {ROADMAP_META.subtitle}
        </p>
        <p className="mt-2 text-xs text-slate-600 text-center">{ROADMAP_META.lastUpdated}</p>

        <div className="mt-10 space-y-5">
          {ROADMAP_PHASES.map((phase) => {
            const color = STATUS_COLOR[phase.status] || '#888';
            return (
              <section
                key={phase.id}
                className="rounded-2xl border bg-slate-900/80 p-5 sm:p-6"
                style={{ borderColor: `${color}55` }}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-lg sm:text-xl font-black text-white">{phase.title}</h2>
                  <span
                    className="text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full text-black shrink-0"
                    style={{ background: color }}
                  >
                    {STATUS_LABEL[phase.status] || phase.status}
                  </span>
                </div>
                <ul className="list-disc pl-5 space-y-2 text-sm text-slate-300 leading-relaxed">
                  {phase.items.map((item, i) => (
                    <li key={`${phase.id}-${i}`}>{item}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-slate-600 text-center leading-relaxed">
          {ROADMAP_META.disclaimer}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/play"
            className="bg-yellow-400 hover:bg-yellow-300 text-black px-8 py-3 rounded-full font-black text-center"
          >
            Play Gift Tap
          </Link>
          <Link
            to="/"
            className="bg-slate-800 hover:bg-slate-700 border border-white/10 px-8 py-3 rounded-full font-bold text-center"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
