/**
 * Walk2u — Gift2U walking app (full-screen).
 * Same login / $G2U ecosystem later; not a Gift Tap skin.
 * Real steps = Health Connect Start/End via Walk2u Android shell (fun.gift2u.walk2u).
 * No GPS fake steps. No Supabase writes yet.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

const MS_PER_BLOCK = 5 * 60 * 1000;
const STRIDE_M = 0.78;

function hasWalk2uHealthBridge() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__GIFT2U_HEALTH_STEPS__ || window.__GIFT2U_WALK2U_SHELL__) return true;
    if (sessionStorage.getItem('gift2u_walk2u_shell') === '1') return true;
    if (localStorage.getItem('gift2u_walk2u_shell') === '1') return true;
    const q = new URLSearchParams(window.location.search || '');
    if (q.get('walk2u_app') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

function postToWalk2uShell(payload) {
  try {
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function requestStepsFromShell(type, extra = {}) {
  const requestId =
    (crypto.randomUUID && crypto.randomUUID()) ||
    `w2u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const done = (detail) => {
      cleanup();
      resolve(detail || { success: false, error: 'No response from Walk2u app' });
    };
    const onEvent = (e) => {
      const d = e?.detail;
      if (!d || d.requestId !== requestId) return;
      done(d);
    };
    const onFn = (d) => {
      if (!d || d.requestId !== requestId) return;
      done(d);
    };
    const cleanup = () => {
      try {
        window.removeEventListener('gift2u-steps-result', onEvent);
      } catch {
        /* ignore */
      }
      if (window.__gift2uOnStepsResult === onFn) {
        try {
          delete window.__gift2uOnStepsResult;
        } catch {
          window.__gift2uOnStepsResult = undefined;
        }
      }
      clearTimeout(timer);
    };
    window.addEventListener('gift2u-steps-result', onEvent);
    window.__gift2uOnStepsResult = onFn;
    const ok = postToWalk2uShell({ type, requestId, ...extra });
    if (!ok) {
      done({
        requestId,
        success: false,
        error: 'Open Walk2u in the Walk2u Android app (Health Connect).',
      });
      return;
    }
    const timer = setTimeout(() => {
      done({ requestId, success: false, error: 'Health Connect timed out.' });
    }, 45000);
  });
}

const C = {
  bg: '#f4faf6',
  bgDeep: '#e8f5ee',
  ink: '#0f2918',
  muted: '#5a7a66',
  line: '#c5e0d0',
  mint: '#34d399',
  mintDeep: '#059669',
  leaf: '#10b981',
  white: '#ffffff',
  warn: '#dc2626',
  soft: '#ecfdf5',
};

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function Walk2uApp() {
  const [tab, setTab] = useState('home'); // home | walk | bag
  const [shoeCount, setShoeCount] = useState(0);
  const [energyBlocks, setEnergyBlocks] = useState(0);
  const [walk2uPoints, setWalk2uPoints] = useState(0);
  const [kmTotal, setKmTotal] = useState(0);
  const [durabilityPct, setDurabilityPct] = useState(100);

  const [walking, setWalking] = useState(false);
  const [sessionKm, setSessionKm] = useState(0);
  const [sessionSteps, setSessionSteps] = useState(0);
  const [sessionMs, setSessionMs] = useState(0);
  const [rewardedMs, setRewardedMs] = useState(0);
  const [stepsError, setStepsError] = useState('');
  const [lastSummary, setLastSummary] = useState(null);
  const [healthBridge, setHealthBridge] = useState(() => hasWalk2uHealthBridge());
  const [pedometerLinked, setPedometerLinked] = useState(() => {
    try {
      return localStorage.getItem('walk2u_hc_linked_v1') === '1';
    } catch {
      return false;
    }
  });
  const [linkingPedometer, setLinkingPedometer] = useState(false);

  const startedAtRef = useRef(0);
  const startedAtIsoRef = useRef('');
  const blocksAtStartRef = useRef(0);
  const stepsRef = useRef(0);
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  const hasShoe = shoeCount > 0;
  const canStart =
    hasShoe &&
    energyBlocks > 0 &&
    !walking &&
    healthBridge &&
    pedometerLinked;

  const stopTimers = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTimers(), [stopTimers]);

  // WebView inject can land after first paint — keep re-checking the Walk2u shell bridge
  useEffect(() => {
    const refresh = () => setHealthBridge(hasWalk2uHealthBridge());
    refresh();
    const id = setInterval(refresh, 1500);
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const applyLiveSteps = useCallback((steps) => {
    const n = Math.max(0, Math.floor(Number(steps) || 0));
    stepsRef.current = n;
    setSessionSteps(n);
    setSessionKm((n * STRIDE_M) / 1000);
  }, []);

  /** Explicit pedometer link — does NOT need shoe/energy (so the prompt always appears). */
  const linkPedometer = useCallback(async () => {
    if (!hasWalk2uHealthBridge()) {
      setHealthBridge(false);
      setStepsError(
        'Open the Walk2u Android app (not Chrome, not Gift Tap). Browser cannot link a pedometer.',
      );
      return;
    }
    setHealthBridge(true);
    setLinkingPedometer(true);
    setStepsError('Asking Health Connect for Steps access…');
    try {
      const perm = await requestStepsFromShell('WALK2U_STEPS_PERMISSION');
      if (!perm?.success) {
        setPedometerLinked(false);
        setStepsError(
          perm?.error ||
            'Allow Steps for Walk2u in Health Connect, then tap Link again.',
        );
        return;
      }
      setPedometerLinked(true);
      setStepsError('');
    } finally {
      setLinkingPedometer(false);
    }
  }, []);

  const openHealthConnectSettings = useCallback(() => {
    postToWalk2uShell({ type: 'OPEN_HEALTH_CONNECT_SETTINGS' });
  }, []);

  const startWalk = useCallback(async () => {
    if (!healthBridge) {
      setStepsError(
        'Open the Walk2u Android app (not Chrome / Gift Tap). Real steps need Health Connect.',
      );
      return;
    }
    if (!pedometerLinked) {
      const perm = await requestStepsFromShell('WALK2U_STEPS_PERMISSION');
      if (!perm?.success) {
        setPedometerLinked(false);
        setStepsError(
          perm?.error ||
            'Allow Steps for Walk2u in Health Connect, then try Start again.',
        );
        return;
      }
      setPedometerLinked(true);
    }
    if (!(hasShoe && energyBlocks > 0 && !walking)) {
      setStepsError(
        !hasShoe
          ? 'Add a demo shoe (Bag / Demo fills), then Start.'
          : energyBlocks <= 0
            ? 'Add energy (Demo fills), then Start.'
            : '',
      );
      return;
    }
    setStepsError('');
    setLastSummary(null);
    setTab('walk');

    const startIso = new Date().toISOString();
    startedAtIsoRef.current = startIso;
    startedAtRef.current = Date.now();
    blocksAtStartRef.current = energyBlocks;
    stepsRef.current = 0;
    setSessionKm(0);
    setSessionSteps(0);
    setSessionMs(0);
    setRewardedMs(0);
    setStepsError('');
    setWalking(true);

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const cap = blocksAtStartRef.current * MS_PER_BLOCK;
      setSessionMs(elapsed);
      setRewardedMs(Math.min(elapsed, cap));
    }, 500);

    // Live step refresh from Health Connect (same Start→now window)
    const poll = async () => {
      const r = await requestStepsFromShell('WALK2U_STEPS_AGGREGATE', {
        startTime: startedAtIsoRef.current,
        endTime: new Date().toISOString(),
      });
      if (r?.success) applyLiveSteps(r.steps);
      else if (r?.error) setStepsError(r.error);
    };
    poll();
    pollRef.current = setInterval(poll, 15000);
  }, [
    healthBridge,
    pedometerLinked,
    hasShoe,
    energyBlocks,
    walking,
    applyLiveSteps,
  ]);

  const endWalk = useCallback(async () => {
    stopTimers();
    setWalking(false);
    const elapsed = Date.now() - startedAtRef.current;
    const cap = blocksAtStartRef.current * MS_PER_BLOCK;
    const rewarded = Math.min(elapsed, cap);

    let steps = stepsRef.current;
    if (healthBridge && startedAtIsoRef.current) {
      const r = await requestStepsFromShell('WALK2U_STEPS_AGGREGATE', {
        startTime: startedAtIsoRef.current,
        endTime: new Date().toISOString(),
      });
      if (r?.success) {
        steps = Math.max(0, Math.floor(Number(r.steps) || 0));
        applyLiveSteps(steps);
      } else if (r?.error) {
        setStepsError(r.error);
      }
    }

    const km = (steps * STRIDE_M) / 1000;
    const frac = elapsed > 0 ? Math.min(1, rewarded / elapsed) : 0;
    const creditedSteps = Math.floor(steps * frac);
    const points = Math.floor(creditedSteps / 1000);
    const blocksUsed =
      rewarded <= 0
        ? 0
        : Math.min(energyBlocks, Math.max(1, Math.ceil(rewarded / MS_PER_BLOCK)));

    setWalk2uPoints((p) => p + points);
    setKmTotal((k) => k + km);
    if (blocksUsed > 0) setEnergyBlocks((e) => Math.max(0, e - blocksUsed));
    setDurabilityPct((d) => Math.max(0, Math.round(d - km * 10)));

    setLastSummary({
      km,
      steps,
      creditedSteps,
      points,
      elapsedMs: elapsed,
      rewardedMs: rewarded,
      blocksUsed,
    });
    setTab('home');
  }, [energyBlocks, stopTimers, healthBridge, applyLiveSteps]);

  const energyCapMs = Math.max(1, blocksAtStartRef.current * MS_PER_BLOCK);
  const energyFrac = walking ? Math.min(1, rewardedMs / energyCapMs) : 0;
  const nextKmMilestone = Math.ceil(kmTotal + 0.001);
  const kmToNext = Math.max(0, nextKmMilestone - kmTotal);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: `linear-gradient(165deg, ${C.bg} 0%, ${C.bgDeep} 45%, #d1fae5 100%)`,
        color: C.ink,
        fontFamily:
          'ui-rounded, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 480,
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Soft blobs */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -80,
          right: -60,
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,211,153,0.35), transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: 120,
          left: -80,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.2), transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <header
        style={{
          padding: '18px 20px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: C.mintDeep,
              textTransform: 'uppercase',
            }}
          >
            Gift2U
          </div>
          <h1
            style={{
              margin: '4px 0 0',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: C.ink,
            }}
          >
            Walk2u
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>
            Walk. Earn. Move.
          </p>
        </div>
        <div
          style={{
            background: C.white,
            border: `1px solid ${C.line}`,
            borderRadius: 999,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: C.mintDeep,
            boxShadow: '0 4px 14px rgba(15,41,24,0.06)',
          }}
        >
          {walk2uPoints.toLocaleString()} W2U
        </div>
      </header>

      <main
        style={{
          flex: 1,
          padding: '8px 16px 100px',
          position: 'relative',
          zIndex: 1,
          overflowY: 'auto',
        }}
      >
        {tab === 'home' && (
          <HomeTab
            kmTotal={kmTotal}
            walk2uPoints={walk2uPoints}
            hasShoe={hasShoe}
            shoeCount={shoeCount}
            durabilityPct={durabilityPct}
            energyBlocks={energyBlocks}
            kmToNext={kmToNext}
            nextKmMilestone={nextKmMilestone}
            lastSummary={lastSummary}
            canStart={canStart}
            onStart={startWalk}
            onDemoShoe={() => {
              setShoeCount((n) => Math.max(1, n));
              setDurabilityPct(100);
            }}
            onDemoEnergy={() => setEnergyBlocks((n) => n + 1)}
            stepsError={stepsError}
            healthBridge={healthBridge}
            pedometerLinked={pedometerLinked}
            linkingPedometer={linkingPedometer}
            onLinkPedometer={linkPedometer}
            onOpenHealthSettings={openHealthConnectSettings}
          />
        )}
        {tab === 'walk' && (
          <WalkTab
            walking={walking}
            sessionKm={sessionKm}
            sessionSteps={sessionSteps}
            sessionMs={sessionMs}
            rewardedMs={rewardedMs}
            energyCapMs={energyCapMs}
            energyFrac={energyFrac}
            stepsError={stepsError}
            healthBridge={healthBridge}
            canStart={canStart}
            hasShoe={hasShoe}
            energyBlocks={energyBlocks}
            onStart={startWalk}
            onEnd={endWalk}
          />
        )}
        {tab === 'bag' && (
          <BagTab
            hasShoe={hasShoe}
            shoeCount={shoeCount}
            durabilityPct={durabilityPct}
            energyBlocks={energyBlocks}
            onDemoShoe={() => {
              setShoeCount((n) => Math.max(1, n));
              setDurabilityPct(100);
            }}
            onDemoEnergy={() => setEnergyBlocks((n) => n + 1)}
          />
        )}
      </main>

      <nav
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 0,
          width: '100%',
          maxWidth: 480,
          padding: '10px 16px calc(12px + env(safe-area-inset-bottom))',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          justifyContent: 'space-around',
          zIndex: 20,
        }}
      >
        <NavBtn active={tab === 'home'} label="Home" onClick={() => !walking && setTab('home')} emoji="🏡" disabled={walking} />
        <NavBtn active={tab === 'walk' || walking} label="Walk" onClick={() => setTab('walk')} emoji="👟" />
        <NavBtn active={tab === 'bag'} label="Bag" onClick={() => !walking && setTab('bag')} emoji="🎒" disabled={walking} />
      </nav>
    </div>
  );
}

function HomeTab({
  kmTotal,
  walk2uPoints,
  hasShoe,
  shoeCount,
  durabilityPct,
  energyBlocks,
  kmToNext,
  nextKmMilestone,
  lastSummary,
  canStart,
  onStart,
  onDemoShoe,
  onDemoEnergy,
  stepsError,
  healthBridge,
  pedometerLinked,
  linkingPedometer,
  onLinkPedometer,
  onOpenHealthSettings,
}) {
  return (
    <>
      <HeroRing km={kmTotal} points={walk2uPoints} />

      <div style={glassCard}>
        <SectionLabel>Ready</SectionLabel>
        <StatLine
          label="Shoe"
          value={hasShoe ? `Common · ${durabilityPct}% · ×${shoeCount}` : 'Equip a shoe to walk'}
          warn={!hasShoe}
        />
        <StatLine
          label="Energy"
          value={`${energyBlocks} block${energyBlocks === 1 ? '' : 's'} · 5 min each`}
          warn={energyBlocks <= 0}
        />
        <StatLine
          label="Next km milestone"
          value={`${kmToNext.toFixed(2)} km → ${nextKmMilestone} km`}
        />
        <StatLine
          label="Pedometer"
          value={
            !healthBridge
              ? 'Need Walk2u app (not browser / Gift Tap)'
              : pedometerLinked
                ? 'Health Connect linked'
                : 'Not linked yet'
          }
          warn={!healthBridge || !pedometerLinked}
        />

        {healthBridge ? (
          <PrimaryButton
            disabled={linkingPedometer}
            onClick={onLinkPedometer}
          >
            {linkingPedometer
              ? 'Linking…'
              : pedometerLinked
                ? 'Pedometer linked ✓ (tap to re-link)'
                : 'Link Health Connect / pedometer'}
          </PrimaryButton>
        ) : (
          <p style={{ color: C.warn, fontSize: 13, margin: '0 0 10px', lineHeight: 1.45 }}>
            Chrome / Gift Tap cannot link a pedometer. Install and open the{' '}
            <strong>Walk2u</strong> APK, then this button appears.
          </p>
        )}

        {healthBridge && pedometerLinked ? (
          <div style={{ marginTop: 10 }}>
            <PrimaryButton disabled={!canStart} onClick={onStart}>
              {!hasShoe
                ? 'Need a shoe'
                : energyBlocks <= 0
                  ? 'Need energy'
                  : 'Start walking'}
            </PrimaryButton>
          </div>
        ) : null}

        {healthBridge ? (
          <button
            type="button"
            onClick={onOpenHealthSettings}
            style={{
              marginTop: 10,
              width: '100%',
              border: 'none',
              background: 'transparent',
              color: C.muted,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Open Health Connect settings
          </button>
        ) : null}

        {stepsError ? (
          <p style={{ color: C.warn, fontSize: 12, margin: '10px 0 0' }}>{stepsError}</p>
        ) : null}
      </div>

      {lastSummary ? (
        <div style={{ ...glassCard, marginTop: 12 }}>
          <SectionLabel>Last walk</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            <MiniStat label="Distance" value={`${lastSummary.km.toFixed(2)} km`} />
            <MiniStat label="Walk2u" value={`+${lastSummary.points}`} />
            <MiniStat label="Steps" value={lastSummary.creditedSteps.toLocaleString()} />
            <MiniStat label="Energy" value={`−${lastSummary.blocksUsed}`} />
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: C.muted }}>
            Local demo — server validation comes next.
          </p>
        </div>
      ) : null}

      <div style={{ ...glassCard, marginTop: 12, borderStyle: 'dashed' }}>
        <SectionLabel>Demo fills</SectionLabel>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
          Not saved. Real shoes from Locksmith; energy shop later.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={onDemoShoe}>+ Demo shoe</SecondaryButton>
          <SecondaryButton onClick={onDemoEnergy}>+1 energy</SecondaryButton>
        </div>
      </div>
    </>
  );
}

function WalkTab({
  walking,
  sessionKm,
  sessionSteps,
  sessionMs,
  rewardedMs,
  energyCapMs,
  energyFrac,
  stepsError,
  healthBridge,
  canStart,
  hasShoe,
  energyBlocks,
  onStart,
  onEnd,
}) {
  if (!walking) {
    return (
      <div style={glassCard}>
        <SectionLabel>Walk</SectionLabel>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }}>
          Walk with the Walk2u app. Steps come from Health Connect (Start→End).
          Rewards only count while energy lasts (1 block = 5 minutes).
        </p>
        <PrimaryButton disabled={!canStart} onClick={onStart}>
          {!healthBridge
            ? 'Open Walk2u app'
            : !hasShoe
              ? 'Need a shoe'
              : energyBlocks <= 0
                ? 'Need energy'
                : 'Start walking'}
        </PrimaryButton>
        {stepsError ? (
          <p style={{ color: C.warn, fontSize: 12, margin: '10px 0 0' }}>{stepsError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          ...glassCard,
          textAlign: 'center',
          padding: '28px 20px',
          background: `linear-gradient(180deg, ${C.white} 0%, ${C.soft} 100%)`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.mintDeep, marginBottom: 6 }}>
          LIVE
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: C.ink,
            lineHeight: 1,
          }}
        >
          {sessionKm.toFixed(2)}
          <span style={{ fontSize: 18, fontWeight: 700, color: C.muted }}> km</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: C.muted }}>
          {sessionSteps.toLocaleString()} steps · from Health Connect
        </div>

        <div style={{ marginTop: 22, textAlign: 'left' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: C.muted,
              marginBottom: 6,
            }}
          >
            <span>Rewarded time</span>
            <span>
              {formatMs(rewardedMs)} / {formatMs(energyCapMs)}
            </span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: C.line,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(energyFrac * 100)}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${C.mint}, ${C.mintDeep})`,
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
            Session {formatMs(sessionMs)}
          </div>
        </div>

        {stepsError ? (
          <p style={{ color: C.warn, fontSize: 12, margin: '14px 0 0' }}>{stepsError}</p>
        ) : (
          <p style={{ color: C.muted, fontSize: 12, margin: '14px 0 0' }}>
            Steps from Health Connect · distance = steps × stride
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onEnd}
        style={{
          width: '100%',
          marginTop: 14,
          padding: 16,
          borderRadius: 16,
          border: 'none',
          fontWeight: 800,
          fontSize: 16,
          cursor: 'pointer',
          background: C.ink,
          color: C.white,
          boxShadow: '0 10px 28px rgba(15,41,24,0.2)',
        }}
      >
        End walk
      </button>
    </>
  );
}

function BagTab({
  hasShoe,
  shoeCount,
  durabilityPct,
  energyBlocks,
  onDemoShoe,
  onDemoEnergy,
}) {
  return (
    <>
      <div style={glassCard}>
        <SectionLabel>Shoes</SectionLabel>
        {hasShoe ? (
          <div
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'center',
              padding: 12,
              borderRadius: 14,
              background: C.soft,
              border: `1px solid ${C.line}`,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: `linear-gradient(145deg, ${C.mint}, ${C.mintDeep})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
              }}
            >
              👟
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Common Shoe</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Equipped · ×{shoeCount}
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 6,
                  borderRadius: 99,
                  background: C.line,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${durabilityPct}%`,
                    height: '100%',
                    background: C.leaf,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Durability {durabilityPct}% · drains by km
              </div>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
            No shoe yet. Without a shoe you cannot start a walk. Rentals may come later.
          </p>
        )}
      </div>

      <div style={{ ...glassCard, marginTop: 12 }}>
        <SectionLabel>Energy</SectionLabel>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12,
          }}
        >
          {Array.from({ length: Math.max(energyBlocks, 3) }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: `1px solid ${C.line}`,
                background: i < energyBlocks ? C.mint : C.white,
                opacity: i < energyBlocks ? 1 : 0.45,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 800,
                color: i < energyBlocks ? C.ink : C.muted,
              }}
            >
              5m
            </div>
          ))}
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
          1 block = 5 minutes of rewarded walk. Buy more later; rarer shoes hold more.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={onDemoShoe}>Demo shoe</SecondaryButton>
          <SecondaryButton onClick={onDemoEnergy}>+1 energy</SecondaryButton>
        </div>
      </div>

      <div style={{ ...glassCard, marginTop: 12 }}>
        <SectionLabel>Rewards</SectionLabel>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            color: C.muted,
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <li>1 Walk2u per 1,000 steps (energy-limited)</li>
          <li>$G2U milestones from km — same idea as Gift2U milestones</li>
          <li>Steps from Health Connect in the Walk2u app — not Gift Tap</li>
          <li>Shared Gift2U login & token — separate game from Gift Tap</li>
        </ul>
      </div>
    </>
  );
}

function HeroRing({ km, points }) {
  const pct = Math.min(100, (km % 1) * 100);
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div
      style={{
        ...glassCard,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 12,
        background: `linear-gradient(135deg, ${C.white} 0%, ${C.soft} 100%)`,
      }}
    >
      <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={r} fill="none" stroke={C.line} strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={C.mintDeep}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 64 64)"
        />
        <text
          x="64"
          y="60"
          textAnchor="middle"
          style={{ fontSize: 22, fontWeight: 800, fill: C.ink }}
        >
          {km.toFixed(1)}
        </text>
        <text
          x="64"
          y="78"
          textAnchor="middle"
          style={{ fontSize: 11, fontWeight: 600, fill: C.muted }}
        >
          km total
        </text>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.mintDeep }}>YOUR TRAIL</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{points} Walk2u</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
          Keep moving toward the next km milestone for $G2U.
        </div>
      </div>
    </div>
  );
}

const glassCard = {
  background: 'rgba(255,255,255,0.88)',
  border: `1px solid ${C.line}`,
  borderRadius: 20,
  padding: 16,
  boxShadow: '0 8px 28px rgba(15,41,24,0.06)',
};

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: C.mintDeep,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function StatLine({ label, value, warn }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        fontSize: 13,
        marginBottom: 8,
      }}
    >
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: warn ? C.warn : C.ink, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div
      style={{
        background: C.soft,
        borderRadius: 12,
        padding: '10px 12px',
        border: `1px solid ${C.line}`,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        marginTop: 12,
        padding: 14,
        borderRadius: 14,
        border: 'none',
        fontWeight: 800,
        fontSize: 15,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled
          ? '#d1d5db'
          : `linear-gradient(90deg, ${C.mint}, ${C.mintDeep})`,
        color: disabled ? '#6b7280' : C.ink,
        boxShadow: disabled ? 'none' : '0 8px 20px rgba(5,150,105,0.25)',
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '11px 10px',
        borderRadius: 12,
        border: `1px solid ${C.line}`,
        background: C.white,
        color: C.mintDeep,
        fontWeight: 700,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function NavBtn({ active, label, onClick, emoji, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        background: 'transparent',
        border: 'none',
        padding: '6px 4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: active ? C.mintDeep : C.muted,
        fontWeight: active ? 800 : 600,
        fontSize: 11,
      }}
    >
      <div style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</div>
      <div style={{ marginTop: 4 }}>{label}</div>
    </button>
  );
}
