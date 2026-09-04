import { useCallback, useEffect, useRef, useState } from 'react';
import { BATTLE, buildDropSchedule } from './battleLogic';
import { hasSecureSession, secureBattleStart, secureBattleFinish } from './secureApi';
import AppNotice from './AppNotice';

/**
 * GiftTap Battle — Falling Gifts PvP (async).
 * Entry: 50 energy (battery) + 50 daily taps.
 * Win: +1 badge_bronze (same backpack badges as weekly ranks).
 */
export default function GiftTapBattle({
  energy = 0,
  dailyTaps = 0,
  maxDailyLimit = 1000,
  onEnergyPaid,
  onInventory,
  playerId,
  playerLevel = 0,
}) {
  const [phase, setPhase] = useState('hub'); // hub | playing | result | waiting
  const [notice, setNotice] = useState({ show: false, message: '', success: true });
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState(null);
  const [result, setResult] = useState(null);

  const [score, setScore] = useState(0);
  const [catches, setCatches] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(BATTLE.DURATION_MS);
  const [gifts, setGifts] = useState([]);

  const dropsRef = useRef([]);
  const caughtRef = useRef(new Set());
  const spawnedRef = useRef(new Set());
  const liveRef = useRef([]);
  const rafRef = useRef(0);
  const startTsRef = useRef(0);
  const scoreRef = useRef(0);
  const catchesRef = useRef(0);
  const finishingRef = useRef(false);

  const entry = BATTLE.ENTRY_ENERGY;
  const dailyLeft = Math.max(0, Math.floor(Number(maxDailyLimit) || 1000) - Math.floor(Number(dailyTaps) || 0));
  const bat = Math.floor(Number(energy) || 0);

  const flash = (message, success = true) => {
    setNotice({ show: true, message, success });
  };

  const stopLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const submitScore = useCallback(
    async (finalScore, finalCatches, matchInfo) => {
      if (finishingRef.current || !matchInfo?.match_id) return;
      finishingRef.current = true;
      setBusy(true);
      try {
        if (!hasSecureSession()) {
          throw new Error('Log in to submit Battle scores');
        }
        const data = await secureBattleFinish({
          matchId: matchInfo.match_id,
          score: finalScore,
          catches: finalCatches,
        });
        if (data.inventory && typeof onInventory === 'function') {
          onInventory(data.inventory);
        }
        setResult(data);
        setPhase(data.status === 'done' ? 'result' : 'waiting');
        if (data.message) flash(data.message, !!data.you_won || !!data.draw);
      } catch (e) {
        flash(e?.message || 'Could not submit score', false);
        setPhase('hub');
      } finally {
        setBusy(false);
        finishingRef.current = false;
      }
    },
    [onInventory],
  );

  const endMatch = useCallback(() => {
    stopLoop();
    setGifts([]);
    submitScore(scoreRef.current, catchesRef.current, match);
  }, [match, submitScore]);

  const tick = useCallback(() => {
    const now = performance.now();
    const elapsed = now - startTsRef.current;
    const left = Math.max(0, BATTLE.DURATION_MS - elapsed);
    setTimeLeftMs(left);

    const schedule = dropsRef.current;
    const caught = caughtRef.current;
    const spawned = spawnedRef.current;
    const live = liveRef.current;
    const height = BATTLE.ARENA_HEIGHT;
    const size = BATTLE.GIFT_SIZE;

    for (const d of schedule) {
      if (caught.has(d.id) || spawned.has(d.id)) continue;
      if (elapsed < d.spawnAt) continue;
      spawned.add(d.id);
      live.push({ ...d, y: -size, bornAt: d.spawnAt });
    }

    const next = [];
    for (const g of live) {
      if (caught.has(g.id)) continue;
      const fallMs = elapsed - g.bornAt;
      const y = -size + (g.speed * Math.max(0, fallMs)) / 1000;
      if (y >= height) continue;
      next.push({ ...g, y });
    }
    liveRef.current = next;
    setGifts(next.map((g) => ({ id: g.id, x: g.x, y: g.y, kind: g.kind })));

    if (left <= 0) {
      endMatch();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [endMatch]);

  const startLocalPlay = useCallback(
    (matchInfo) => {
      stopLoop();
      finishingRef.current = false;
      dropsRef.current = buildDropSchedule(matchInfo.seed);
      caughtRef.current = new Set();
      spawnedRef.current = new Set();
      liveRef.current = [];
      scoreRef.current = 0;
      catchesRef.current = 0;
      setScore(0);
      setCatches(0);
      setGifts([]);
      setTimeLeftMs(BATTLE.DURATION_MS);
      setMatch(matchInfo);
      setResult(null);
      setPhase('playing');
      startTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  useEffect(() => () => stopLoop(), []);

  const onFindMatch = async () => {
    if (busy) return;
    if (!hasSecureSession()) {
      flash('Log in to play Battle', false);
      return;
    }
    if (bat < entry) {
      flash(`Need ${entry} energy (have ${bat})`, false);
      return;
    }
    if (dailyLeft < entry) {
      flash(`Need ${entry} daily taps left (have ${dailyLeft})`, false);
      return;
    }
    setBusy(true);
    try {
      const data = await secureBattleStart();
      if (typeof onEnergyPaid === 'function') {
        onEnergyPaid({
          last_energy: data.last_energy,
          daily_taps: data.daily_taps,
        });
      }
      const info = {
        match_id: data.match_id,
        seed: data.seed,
        role: data.role,
        status: data.status,
        entry_energy: data.entry_energy,
        win_badge: data.win_badge,
        opponent_id: data.opponent_id,
      };
      if (data.already_scored) {
        setMatch(info);
        setPhase('waiting');
        flash('Waiting for opponent…', true);
      } else {
        startLocalPlay(info);
      }
    } catch (e) {
      flash(e?.message || 'Could not start Battle', false);
    } finally {
      setBusy(false);
    }
  };

  const onTapGift = (id, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (phase !== 'playing') return;
    if (caughtRef.current.has(id)) return;
    const g = liveRef.current.find((x) => x.id === id);
    if (!g) return;
    caughtRef.current.add(id);
    liveRef.current = liveRef.current.filter((x) => x.id !== id);
    const pts = g.points || (g.kind === 'golden' ? BATTLE.GOLDEN_POINTS : BATTLE.NORMAL_POINTS);
    scoreRef.current += pts;
    catchesRef.current += 1;
    setScore(scoreRef.current);
    setCatches(catchesRef.current);
    setGifts((prev) => prev.filter((x) => x.id !== id));
  };

  const secLeft = (timeLeftMs / 1000).toFixed(1);

  return (
    <div
      style={{
        padding: '16px 16px 100px',
        color: '#fff',
        maxWidth: 480,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <AppNotice
        show={notice.show}
        message={notice.message}
        success={notice.success}
        onClose={() => setNotice((n) => ({ ...n, show: false }))}
      />

      <h2 style={{ margin: '0 0 6px', color: '#fbef43', fontSize: 22 }}>GiftTap Battle</h2>
      <p style={{ margin: '0 0 16px', color: '#888', fontSize: 13, lineHeight: 1.4 }}>
        Falling Gifts duel — tap gifts before they hit the floor. Same drops for both players.
        Winner gets a <strong style={{ color: '#cd7f32' }}>Bronze badge</strong> (same as weekly ranks).
      </p>

      {phase === 'hub' && (
        <div
          style={{
            background: '#1c1e22',
            borderRadius: 16,
            padding: 16,
            border: '1px solid #333',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#aaa', fontSize: 13 }}>Battery</span>
            <strong style={{ color: '#fbef43' }}>{bat}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#aaa', fontSize: 13 }}>Daily left</span>
            <strong>
              {dailyLeft} / {Math.floor(Number(maxDailyLimit) || 1000)}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#aaa', fontSize: 13 }}>Entry cost</span>
            <span style={{ color: '#f87171' }}>
              −{entry} energy · −{entry} daily
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: '#aaa', fontSize: 13 }}>Winner reward</span>
            <span style={{ color: '#cd7f32' }}>+1 Bronze badge</span>
          </div>
          <ul style={{ color: '#888', fontSize: 12, paddingLeft: 18, margin: '0 0 16px' }}>
            <li>🎁 Normal = 1 pt · ✨ Golden = 3 pts</li>
            <li>Same seed for both players (fair)</li>
            <li>Draw = no badge (energy already spent)</li>
            <li>{BATTLE.DURATION_MS / 1000}s round · Lv {playerLevel}</li>
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={onFindMatch}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 30,
              border: 'none',
              background: busy ? '#444' : '#fbef43',
              color: '#000',
              fontWeight: 'bold',
              fontSize: 16,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Matching…' : 'Find opponent'}
          </button>
        </div>
      )}

      {phase === 'playing' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            <span>Score {score}</span>
            <span style={{ color: '#fbef43' }}>{secLeft}s</span>
            <span style={{ color: '#888' }}>Caught {catches}</span>
          </div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: BATTLE.ARENA_WIDTH,
              height: BATTLE.ARENA_HEIGHT,
              margin: '0 auto',
              background: 'linear-gradient(180deg, #0f172a 0%, #1c1e22 70%, #111 100%)',
              borderRadius: 16,
              border: '2px solid #333',
              overflow: 'hidden',
              touchAction: 'manipulation',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 6,
                background: 'rgba(255,77,77,0.35)',
              }}
            />
            {gifts.map((g) => (
              <button
                key={g.id}
                type="button"
                onPointerDown={(e) => onTapGift(g.id, e)}
                style={{
                  position: 'absolute',
                  left: g.x,
                  top: g.y,
                  width: BATTLE.GIFT_SIZE,
                  height: BATTLE.GIFT_SIZE,
                  borderRadius: 12,
                  border: g.kind === 'golden' ? '2px solid #ffd700' : '1px solid #444',
                  background:
                    g.kind === 'golden'
                      ? 'radial-gradient(circle, #ffe566, #c9a227)'
                      : 'radial-gradient(circle, #60a5fa, #2563eb)',
                  fontSize: 22,
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {g.kind === 'golden' ? '✨' : '🎁'}
              </button>
            ))}
          </div>
        </div>
      )}

      {(phase === 'waiting' || phase === 'result') && (
        <div
          style={{
            background: '#1c1e22',
            borderRadius: 16,
            padding: 16,
            border: '1px solid #333',
            textAlign: 'center',
          }}
        >
          {phase === 'waiting' && (
            <>
              <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
              <h3 style={{ margin: '0 0 8px', color: '#fbef43' }}>Waiting</h3>
              <p style={{ color: '#aaa', fontSize: 13 }}>
                {result?.message || 'Score saved. Waiting for an opponent…'}
              </p>
              <p style={{ color: '#fff', fontWeight: 700, marginTop: 12 }}>
                Your score: {result?.your_score ?? score}
              </p>
            </>
          )}
          {phase === 'result' && result && (
            <>
              <div style={{ fontSize: 40, marginBottom: 8 }}>
                {result.draw ? '🤝' : result.you_won ? '🏆' : '💀'}
              </div>
              <h3 style={{ margin: '0 0 8px', color: '#fbef43' }}>
                {result.draw ? 'Draw' : result.you_won ? 'You won!' : 'You lost'}
              </h3>
              <p style={{ color: '#ccc', fontSize: 13, marginBottom: 12 }}>
                {result.score_a} vs {result.score_b}
              </p>
              {result.you_won && (
                <p style={{ color: '#cd7f32', fontWeight: 700 }}>
                  +{result.badge_qty || 1} Bronze badge → Backpack
                </p>
              )}
              {result.draw && (
                <p style={{ color: '#88a' }}>No badge — energy already spent</p>
              )}
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPhase('hub');
              setResult(null);
              setMatch(null);
            }}
            style={{
              marginTop: 16,
              width: '100%',
              padding: 12,
              borderRadius: 24,
              border: '1px solid #444',
              background: '#2a2d35',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back to Battle hub
          </button>
          {phase === 'waiting' && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!match?.match_id) return;
                setBusy(true);
                try {
                  const data = await secureBattleFinish({
                    matchId: match.match_id,
                    score: result?.your_score ?? score,
                    catches,
                  });
                  if (data.inventory && typeof onInventory === 'function') {
                    onInventory(data.inventory);
                  }
                  setResult(data);
                  if (data.status === 'done') setPhase('result');
                  else flash(data.message || 'Still waiting…', true);
                } catch (e) {
                  flash(e?.message || 'Refresh failed', false);
                } finally {
                  setBusy(false);
                }
              }}
              style={{
                marginTop: 8,
                width: '100%',
                padding: 12,
                borderRadius: 24,
                border: 'none',
                background: '#fbef43',
                color: '#000',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Check for results
            </button>
          )}
        </div>
      )}

      {!playerId && (
        <p style={{ color: '#f66', fontSize: 12, marginTop: 12 }}>Sign in to play Battle.</p>
      )}
    </div>
  );
}
