/**
 * Walk2u — native app (fun.gift2u.walk2u)
 * STEPN-style: GPS + signal bars. Start → Pause → Continue / End.
 * GPS permission once. Speed shown for upcoming min/max walk limits.
 * Demo shoe / energy on Home.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

/** Ongoing notification + GPS while walking (STEPN-style status-bar icon). */
const WALK_LOCATION_TASK = 'WALK2U_WALK_LOCATION';
const walkLocListeners = new Set();

TaskManager.defineTask(WALK_LOCATION_TASK, ({ data, error }) => {
  if (error) {
    walkLocListeners.forEach((fn) => {
      try {
        fn({ error });
      } catch {
        /* ignore */
      }
    });
    return;
  }
  const locations = data?.locations;
  if (!locations?.length) return;
  const location = locations[locations.length - 1];
  walkLocListeners.forEach((fn) => {
    try {
      fn({ location });
    } catch {
      /* ignore */
    }
  });
});

function addWalkLocationListener(fn) {
  walkLocListeners.add(fn);
  return () => walkLocListeners.delete(fn);
}

async function startWalkForegroundGps() {
  const running = await Location.hasStartedLocationUpdatesAsync(
    WALK_LOCATION_TASK,
  );
  if (running) {
    await Location.stopLocationUpdatesAsync(WALK_LOCATION_TASK);
  }
  await Location.startLocationUpdatesAsync(WALK_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 1,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Walk2u',
      notificationBody: 'Walk in progress — tap to open',
      notificationColor: '#059669',
    },
  });
}

async function stopWalkForegroundGps() {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(
      WALK_LOCATION_TASK,
    );
    if (running) {
      await Location.stopLocationUpdatesAsync(WALK_LOCATION_TASK);
    }
  } catch {
    /* ignore */
  }
}

const MS_PER_BLOCK = 5 * 60 * 1000;
const STRIDE_M = 0.78;
/** Hard filter for GPS teleport jumps (~16 km/h). Real walk min/max limits come later. */
const MAX_SPEED_M_S = 4.5;
const MIN_MOVE_M = 2;
/** Future walk band (shown now; not enforced yet) */
const WALK_SPEED_MIN_KMH = 1;
const WALK_SPEED_MAX_KMH = 12;

const C = {
  bg: '#f4faf6',
  ink: '#0f2918',
  muted: '#5a7a66',
  line: '#c5e0d0',
  mint: '#34d399',
  mintDeep: '#059669',
  white: '#ffffff',
  warn: '#dc2626',
  soft: '#ecfdf5',
  gpsGood: '#22c55e',
  gpsOk: '#eab308',
  gpsBad: '#ef4444',
  gpsOff: '#d1d5db',
};

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** STEPN-style bars from GPS accuracy (meters). Lower accuracy value = better. */
function gpsBarsFromAccuracy(accuracyM) {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return 0;
  if (accuracyM <= 8) return 4;
  if (accuracyM <= 15) return 3;
  if (accuracyM <= 30) return 2;
  if (accuracyM <= 60) return 1;
  return 0;
}

function gpsLabel(bars) {
  if (bars >= 4) return 'GPS strong';
  if (bars === 3) return 'GPS good';
  if (bars === 2) return 'GPS weak';
  if (bars === 1) return 'GPS poor';
  return 'No GPS fix';
}

function GpsBars({ bars }) {
  const color =
    bars >= 3 ? C.gpsGood : bars === 2 ? C.gpsOk : bars >= 1 ? C.gpsBad : C.gpsOff;
  const heights = [10, 14, 18, 22];
  return (
    <View style={styles.gpsWrap}>
      <View style={styles.gpsBarsRow}>
        {heights.map((h, i) => (
          <View
            key={i}
            style={[
              styles.gpsBar,
              {
                height: h,
                backgroundColor: i < bars ? color : C.gpsOff,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.gpsLabel, { color }]}>{gpsLabel(bars)}</Text>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState('home');
  const [shoeCount, setShoeCount] = useState(0);
  const [energyBlocks, setEnergyBlocks] = useState(0);
  const [walk2uPoints, setWalk2uPoints] = useState(0);
  const [kmTotal, setKmTotal] = useState(0);
  const [durabilityPct, setDurabilityPct] = useState(100);

  const [walking, setWalking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sessionKm, setSessionKm] = useState(0);
  const [sessionSteps, setSessionSteps] = useState(0);
  const [sessionMs, setSessionMs] = useState(0);
  const [rewardedMs, setRewardedMs] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [gpsBars, setGpsBars] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [lastSummary, setLastSummary] = useState(null);

  const lastPosRef = useRef(null);
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pauseStartedAtRef = useRef(0);
  const blocksAtStartRef = useRef(0);
  const distMRef = useRef(0);
  const tickRef = useRef(null);
  const pausedRef = useRef(false);
  const onPositionRef = useRef(null);

  const hasShoe = shoeCount > 0;
  const canStart = hasShoe && energyBlocks > 0 && !walking;

  const stopGps = useCallback(async () => {
    await stopWalkForegroundGps();
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopGps();
  }, [stopGps]);

  // Bridge TaskManager locations → React (status-bar notification stays up)
  useEffect(() => {
    return addWalkLocationListener((payload) => {
      if (payload?.error) {
        setStatusMsg(payload.error.message || 'GPS error');
        return;
      }
      const loc = payload?.location;
      if (!loc?.coords) return;
      onPositionRef.current?.(loc);
    });
  }, []);

  const sessionElapsedMs = useCallback(() => {
    const now = Date.now();
    let pausedExtra = pausedTotalRef.current;
    if (pausedRef.current && pauseStartedAtRef.current) {
      pausedExtra += now - pauseStartedAtRef.current;
    }
    return Math.max(0, now - startedAtRef.current - pausedExtra);
  }, []);

  const onPosition = useCallback((pos) => {
    if (pausedRef.current) return;
    const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
    const now = Date.now();
    const acc = accuracy != null ? Number(accuracy) : null;
    setGpsAccuracy(acc);
    setGpsBars(gpsBarsFromAccuracy(acc));

    const cur = { lat, lon, t: now };
    const prev = lastPosRef.current;
    lastPosRef.current = cur;
    if (!prev) return;

    const dt = (now - prev.t) / 1000;
    if (dt <= 0) return;
    const d = haversineM(prev, cur);
    if (d < MIN_MOVE_M) return;
    const implied = d / dt;
    if (implied > MAX_SPEED_M_S) return;

    let speedMs =
      typeof speed === 'number' && Number.isFinite(speed) && speed >= 0
        ? speed
        : implied;
    setSpeedKmh(Math.round(speedMs * 3.6 * 10) / 10);

    distMRef.current += d;
    setSessionKm(distMRef.current / 1000);
    setSessionSteps(Math.floor(distMRef.current / STRIDE_M));
  }, []);

  useEffect(() => {
    onPositionRef.current = onPosition;
  }, [onPosition]);

  const startGpsWatch = useCallback(async () => {
    await startWalkForegroundGps();
  }, []);

  const ensureGpsPermission = useCallback(async () => {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.status === 'granted') return true;
    const req = await Location.requestForegroundPermissionsAsync();
    return req.status === 'granted';
  }, []);

  const startWalk = useCallback(async () => {
    if (!canStart) {
      setStatusMsg(
        !hasShoe
          ? 'Add a demo shoe below, then Start.'
          : energyBlocks <= 0
            ? 'Add energy below, then Start.'
            : '',
      );
      return;
    }
    setStatusMsg('Getting GPS…');
    setLastSummary(null);

    const ok = await ensureGpsPermission();
    if (!ok) {
      setStatusMsg('Location permission denied. Enable GPS for Walk2u once in settings.');
      return;
    }

    try {
      const first = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      lastPosRef.current = {
        lat: first.coords.latitude,
        lon: first.coords.longitude,
        t: Date.now(),
      };
      const acc =
        first.coords.accuracy != null ? Number(first.coords.accuracy) : null;
      setGpsAccuracy(acc);
      setGpsBars(gpsBarsFromAccuracy(acc));
      const sp = first.coords.speed;
      if (typeof sp === 'number' && Number.isFinite(sp) && sp >= 0) {
        setSpeedKmh(Math.round(sp * 3.6 * 10) / 10);
      } else {
        setSpeedKmh(0);
      }
    } catch {
      setStatusMsg('Could not get GPS. Go outside and try again.');
      return;
    }

    distMRef.current = 0;
    startedAtRef.current = Date.now();
    pausedTotalRef.current = 0;
    pauseStartedAtRef.current = 0;
    pausedRef.current = false;
    blocksAtStartRef.current = energyBlocks;
    setSessionKm(0);
    setSessionSteps(0);
    setSessionMs(0);
    setRewardedMs(0);
    setPaused(false);
    setStatusMsg('');
    setWalking(true);
    setTab('walk');

    await startGpsWatch();

    tickRef.current = setInterval(() => {
      const elapsed = sessionElapsedMs();
      const cap = blocksAtStartRef.current * MS_PER_BLOCK;
      setSessionMs(elapsed);
      setRewardedMs(Math.min(elapsed, cap));
    }, 500);
  }, [
    canStart,
    hasShoe,
    energyBlocks,
    ensureGpsPermission,
    startGpsWatch,
    sessionElapsedMs,
  ]);

  const pauseWalk = useCallback(async () => {
    if (!walking || pausedRef.current) return;
    pausedRef.current = true;
    pauseStartedAtRef.current = Date.now();
    setPaused(true);
    setSpeedKmh(0);
    lastPosRef.current = null;
    // Stop foreground notification while paused (Continue brings it back)
    await stopWalkForegroundGps();
  }, [walking]);

  const continueWalk = useCallback(async () => {
    if (!walking || !pausedRef.current) return;
    if (pauseStartedAtRef.current) {
      pausedTotalRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = 0;
    }
    pausedRef.current = false;
    setPaused(false);
    setStatusMsg('Resuming GPS…');
    try {
      const ok = await ensureGpsPermission();
      if (!ok) {
        setStatusMsg('Location permission denied.');
        pausedRef.current = true;
        pauseStartedAtRef.current = Date.now();
        setPaused(true);
        return;
      }
      const first = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      lastPosRef.current = {
        lat: first.coords.latitude,
        lon: first.coords.longitude,
        t: Date.now(),
      };
      const acc =
        first.coords.accuracy != null ? Number(first.coords.accuracy) : null;
      setGpsAccuracy(acc);
      setGpsBars(gpsBarsFromAccuracy(acc));
      await startGpsWatch();
      setStatusMsg('');
    } catch {
      setStatusMsg('Could not resume GPS. Try Continue again outdoors.');
      pausedRef.current = true;
      pauseStartedAtRef.current = Date.now();
      setPaused(true);
    }
  }, [walking, ensureGpsPermission, startGpsWatch]);

  const endWalk = useCallback(async () => {
    if (pausedRef.current && pauseStartedAtRef.current) {
      pausedTotalRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = 0;
    }
    pausedRef.current = false;
    await stopGps();
    setWalking(false);
    setPaused(false);
    const elapsed = Math.max(
      0,
      Date.now() - startedAtRef.current - pausedTotalRef.current,
    );
    const cap = blocksAtStartRef.current * MS_PER_BLOCK;
    const rewarded = Math.min(elapsed, cap);
    const distM = distMRef.current;
    const km = distM / 1000;
    const steps = Math.floor(distM / STRIDE_M);
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
    setLastSummary({ km, creditedSteps, points, blocksUsed });
    setGpsBars(0);
    setGpsAccuracy(null);
    setSpeedKmh(0);
    setTab('home');
  }, [energyBlocks, stopGps]);

  const energyCapMs = Math.max(1, blocksAtStartRef.current * MS_PER_BLOCK);
  const energyFrac = walking ? Math.min(1, rewardedMs / energyCapMs) : 0;
  const nextKmMilestone = Math.ceil(kmTotal + 0.001);
  const kmToNext = Math.max(0, nextKmMilestone - kmTotal);

  const addDemoShoe = () => {
    setShoeCount((n) => Math.max(1, n));
    setDurabilityPct(100);
  };
  const addDemoEnergy = () => setEnergyBlocks((n) => n + 1);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <Text style={styles.brand}>Walk2u</Text>
        <Text style={styles.points}>{walk2uPoints.toLocaleString()} W2U</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'home' && (
          <View>
            <View style={styles.hero}>
              <Text style={styles.heroKm}>{kmTotal.toFixed(1)}</Text>
              <Text style={styles.heroLabel}>km total</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Ready</Text>
              <Row
                label="Shoe"
                value={
                  hasShoe
                    ? `Common · ${durabilityPct}% · ×${shoeCount}`
                    : 'Equip a shoe to walk'
                }
                warn={!hasShoe}
              />
              <Row
                label="Energy"
                value={`${energyBlocks} block${energyBlocks === 1 ? '' : 's'} · 5 min each`}
                warn={energyBlocks <= 0}
              />
              <Row
                label="Next km milestone"
                value={`${kmToNext.toFixed(2)} km → ${nextKmMilestone} km`}
              />

              <Btn
                title={
                  !hasShoe
                    ? 'Need a shoe'
                    : energyBlocks <= 0
                      ? 'Need energy'
                      : 'Start walking'
                }
                onPress={startWalk}
                disabled={!canStart}
                primary
              />
              {statusMsg ? <Text style={styles.warn}>{statusMsg}</Text> : null}
              <Text style={styles.hint}>
                STEPN-style GPS · status-bar walk icon while live · Pause anytime
              </Text>
            </View>

            <View style={[styles.card, styles.cardDashed, { marginTop: 12 }]}>
              <Text style={styles.label}>Demo fills</Text>
              <Text style={styles.hint}>
                Not saved. Real shoes from Locksmith; energy shop later.
              </Text>
              <View style={styles.rowBtns}>
                <Btn title="+ Demo shoe" onPress={addDemoShoe} style={{ flex: 1 }} />
                <Btn title="+1 energy" onPress={addDemoEnergy} style={{ flex: 1 }} />
              </View>
            </View>

            {lastSummary ? (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.label}>Last walk</Text>
                <View style={styles.grid2}>
                  <Mini label="Distance" value={`${lastSummary.km.toFixed(2)} km`} />
                  <Mini label="Walk2u" value={`+${lastSummary.points}`} />
                  <Mini
                    label="Steps"
                    value={lastSummary.creditedSteps.toLocaleString()}
                  />
                  <Mini label="Energy" value={`−${lastSummary.blocksUsed}`} />
                </View>
              </View>
            ) : null}
          </View>
        )}

        {tab === 'walk' && (
          <View>
            {!walking ? (
              <View style={styles.card}>
                <Text style={styles.label}>Walk</Text>
                <Text style={styles.hint}>
                  Add shoe + energy on Home, then Start. GPS tracks distance
                  (STEPN-style). Steps estimated from distance.
                </Text>
                <Btn
                  title={
                    !hasShoe
                      ? 'Need a shoe'
                      : energyBlocks <= 0
                        ? 'Need energy'
                        : 'Start walking'
                  }
                  onPress={startWalk}
                  disabled={!canStart}
                  primary
                />
                {statusMsg ? <Text style={styles.warn}>{statusMsg}</Text> : null}
              </View>
            ) : (
              <View>
                <View style={[styles.card, styles.liveCard]}>
                  <GpsBars bars={paused ? 0 : gpsBars} />
                  {!paused && gpsAccuracy != null ? (
                    <Text style={styles.hint}>±{Math.round(gpsAccuracy)} m</Text>
                  ) : null}
                  <Text style={styles.liveTag}>{paused ? 'PAUSED' : 'LIVE'}</Text>
                  <Text style={styles.liveKm}>
                    {sessionKm.toFixed(2)}
                    <Text style={styles.liveKmUnit}> km</Text>
                  </Text>
                  <Text style={styles.hint}>
                    {sessionSteps.toLocaleString()} steps · {speedKmh.toFixed(1)} km/h
                  </Text>
                  <View style={styles.barWrap}>
                    <View style={styles.barTop}>
                      <Text style={styles.hint}>Rewarded time</Text>
                      <Text style={styles.hint}>
                        {formatMs(rewardedMs)} / {formatMs(energyCapMs)}
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.round(energyFrac * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.hint, { marginTop: 8 }]}>
                      Session {formatMs(sessionMs)}
                      {paused ? ' · timer paused' : ''}
                    </Text>
                  </View>
                  {statusMsg ? <Text style={styles.warn}>{statusMsg}</Text> : null}
                  {!paused && gpsBars <= 1 ? (
                    <Text style={styles.warn}>
                      Weak GPS — move outdoors / wait for a better fix
                    </Text>
                  ) : null}
                </View>
                {paused ? (
                  <View style={{ marginTop: 14, gap: 10 }}>
                    <Btn title="Continue" onPress={continueWalk} primary />
                    <Btn title="End walk" onPress={endWalk} dark />
                  </View>
                ) : (
                  <Btn title="Pause" onPress={pauseWalk} dark style={{ marginTop: 14 }} />
                )}
              </View>
            )}
          </View>
        )}

        {tab === 'bag' && (
          <View style={styles.card}>
            <Text style={styles.label}>Bag</Text>
            <Row
              label="Shoe"
              value={
                hasShoe
                  ? `Common L1 · ${durabilityPct}% · ×${shoeCount}`
                  : 'Empty'
              }
              warn={!hasShoe}
            />
            <Row label="Energy" value={`${energyBlocks} block(s)`} />
            <View style={styles.rowBtns}>
              <Btn title="+ Demo shoe" onPress={addDemoShoe} style={{ flex: 1 }} />
              <Btn title="+1 energy" onPress={addDemoEnergy} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.nav}>
        <NavBtn
          label="Home"
          emoji="🏡"
          active={tab === 'home'}
          disabled={walking}
          onPress={() => !walking && setTab('home')}
        />
        <NavBtn
          label="Walk"
          emoji="👟"
          active={tab === 'walk' || walking}
          onPress={() => setTab('walk')}
        />
        <NavBtn
          label="Bag"
          emoji="🎒"
          active={tab === 'bag'}
          disabled={walking}
          onPress={() => !walking && setTab('bag')}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, warn }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, warn && { color: C.warn }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Mini({ label, value }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

function Btn({ title, onPress, disabled, primary, dark, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        primary && styles.btnPrimary,
        dark && styles.btnDark,
        disabled && styles.btnDisabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          dark && { color: C.white },
          disabled && styles.btnTextDisabled,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function NavBtn({ label, emoji, active, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.navBtn, active && styles.navBtnActive, disabled && { opacity: 0.4 }]}
    >
      <Text style={styles.navEmoji}>{emoji}</Text>
      <Text style={[styles.navBtnText, active && styles.navBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.white,
  },
  brand: { fontSize: 22, fontWeight: '900', color: C.mintDeep, fontStyle: 'italic' },
  points: { fontSize: 14, fontWeight: '800', color: C.ink },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 28 },
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 12,
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
  },
  heroKm: { fontSize: 48, fontWeight: '900', color: C.ink, letterSpacing: -1 },
  heroLabel: { fontSize: 13, fontWeight: '700', color: C.muted, marginTop: 4 },
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
  },
  cardDashed: { borderStyle: 'dashed' },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: C.mintDeep,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  rowLabel: { fontSize: 13, color: C.muted, fontWeight: '600' },
  rowValue: {
    fontSize: 13,
    color: C.ink,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  hint: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 8 },
  warn: { fontSize: 12, color: C.warn, marginTop: 10, lineHeight: 18 },
  btn: {
    marginTop: 6,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.soft,
    borderWidth: 1,
    borderColor: C.mint,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: C.mint, borderColor: C.mintDeep },
  btnDark: { backgroundColor: C.ink, borderColor: C.ink },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 15, fontWeight: '800', color: C.ink },
  btnTextDisabled: { color: C.muted },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mini: {
    width: '47%',
    backgroundColor: C.soft,
    borderRadius: 12,
    padding: 10,
  },
  miniLabel: { fontSize: 11, color: C.muted, fontWeight: '600' },
  miniValue: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 2 },
  liveCard: { alignItems: 'center', paddingVertical: 24 },
  liveTag: { fontSize: 13, fontWeight: '800', color: C.mintDeep, marginTop: 10, marginBottom: 6 },
  liveKm: { fontSize: 48, fontWeight: '900', color: C.ink, letterSpacing: -1 },
  liveKmUnit: { fontSize: 18, fontWeight: '700', color: C.muted },
  gpsWrap: { alignItems: 'center', marginBottom: 4 },
  gpsBarsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 24 },
  gpsBar: { width: 8, borderRadius: 2 },
  gpsLabel: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  barWrap: { width: '100%', marginTop: 22 },
  barTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: C.line,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: C.mintDeep, borderRadius: 999 },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingBottom: 8,
    paddingTop: 4,
  },
  navBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  navBtnActive: { borderTopWidth: 3, borderTopColor: C.mintDeep, paddingTop: 7 },
  navEmoji: { fontSize: 18 },
  navBtnText: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 2 },
  navBtnTextActive: { color: C.mintDeep },
});
