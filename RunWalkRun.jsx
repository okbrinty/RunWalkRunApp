/**
 * RunWalkTimer.jsx
 *
 * A React Native run/walk interval timer app.
 *
 * Dependencies needed in your project:
 *   npm install @react-native-picker/picker
 *   (For audio/vibration: expo-haptics or react-native's built-in Vibration module is used)
 *
 * Usage: Drop this file into your project and render <RunWalkTimer /> as your root component,
 * or import and use it within your existing navigator.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  StatusBar,
  Vibration,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';


const { width, height } = Dimensions.get('window');

// ─── Color Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0D0D0D',
  surface: '#161616',
  border: '#2A2A2A',
  accent: '#E8FF47',       // electric lime — the hero color
  accentDim: '#B8CC2A',
  run: '#FF5C3A',          // punchy orange-red for RUN
  runDim: '#CC3A1F',
  walk: '#3AB8FF',         // cool blue for WALK
  walkDim: '#1A8ACC',
  textPrimary: '#F5F5F5',
  textSecondary: '#888888',
  textMuted: '#444444',
};

// ─── Utility Helpers ─────────────────────────────────────────────────────────

/** Format seconds → "M:SS" */
const fmtTime = (totalSecs) => {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** Format seconds → "H:MM:SS" or "M:SS" */
const fmtDuration = (totalSecs) => {
  if (totalSecs >= 3600) {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return fmtTime(totalSecs);
};

/**
 * Given paces (sec/mile) and intervals (sec), return total time (sec) for a distance (miles).
 * Uses weighted average pace.
 */
const calcTotalTime = (runPace, walkPace, runInterval, walkInterval, distanceMiles) => {
  const cycleDuration = runInterval + walkInterval;
  if (cycleDuration === 0 || runPace === 0 || walkPace === 0) return 0;

  // Distance covered per cycle
  const runDist = runInterval / runPace;   // miles
  const walkDist = walkInterval / walkPace; // miles
  const cycleDistance = runDist + walkDist;

  if (cycleDistance === 0) return 0;

  const cycles = distanceMiles / cycleDistance;
  return Math.round(cycles * cycleDuration);
};

// ─── Dropdown (native-style modal picker) ────────────────────────────────────

function Dropdown({ label, value, options, onChange, color }) {
  const [open, setOpen] = useState(false);
  const accentColor = color || C.accent;

  return (
    <>
      <TouchableOpacity
        style={[styles.dropdown, { borderColor: open ? accentColor : C.border }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={styles.dropdownLabel}>{label}</Text>
        <View style={styles.dropdownValueRow}>
          <Text style={[styles.dropdownValue, { color: accentColor }]}>{value.label}</Text>
          <Text style={[styles.dropdownChevron, { color: accentColor }]}>▾</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value.toString()}
              showsVerticalScrollIndicator={false}
              getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
              initialScrollIndex={Math.max(0, options.findIndex(o => o.value === value.value))}
              renderItem={({ item }) => {
                const selected = item.value === value.value;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, selected && { backgroundColor: accentColor + '22' }]}
                    onPress={() => { onChange(item); setOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalItemText, selected && { color: accentColor, fontWeight: '700' }]}>
                      {item.label}
                    </Text>
                    {selected && <Text style={[styles.modalCheck, { color: accentColor }]}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Distance Card ────────────────────────────────────────────────────────────

function DistanceCard({ label, miles, runPace, walkPace, runInterval, walkInterval }) {
  const totalSecs = calcTotalTime(runPace, walkPace, runInterval, walkInterval, miles);
  return (
    <View style={styles.distCard}>
      <Text style={styles.distLabel}>{label}</Text>
      <Text style={styles.distValue}>{totalSecs > 0 ? fmtDuration(totalSecs) : '—'}</Text>
    </View>
  );
}

// ─── Option Generators ────────────────────────────────────────────────────────

/** Paces: 5:00/mi to 20:00/mi in 30-second steps (stored as sec/mile) */
const PACE_OPTIONS = (() => {
  const opts = [];
  for (let s = 5 * 60; s <= 20 * 60; s += 30) {
    opts.push({ value: s, label: `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')} /mi` });
  }
  return opts;
})();

/** Paces: 3:00/km to 13:00/km in 15-second steps (stored as sec/mile internally) */
const PACE_OPTIONS_KM = (() => {
  const opts = [];
  for (let skm = 3 * 60; skm <= 13 * 60; skm += 15) {
    const secPerMile = Math.round(skm * 1.60934);
    opts.push({ value: secPerMile, label: `${Math.floor(skm / 60)}:${(skm % 60).toString().padStart(2, '0')} /km` });
  }
  return opts;
})();

/** Treadmill speeds: 1.0 to 15.0 mph in 0.5-step increments (stored as sec/mile internally) */
const MPH_OPTIONS = (() => {
  const opts = [];
  for (let mph = 1.0; mph <= 15.0; mph = Math.round((mph + 0.5) * 10) / 10) {
    const secPerMile = Math.round(3600 / mph);
    opts.push({ value: secPerMile, label: `${mph.toFixed(1)} mph` });
  }
  return opts;
})();

/** Treadmill speeds: 1.5 to 24.0 kph in 0.5-step increments (stored as sec/mile internally) */
const KPH_OPTIONS = (() => {
  const opts = [];
  for (let kph = 1.5; kph <= 24.0; kph = Math.round((kph + 0.5) * 10) / 10) {
    const secPerMile = Math.round(3600 * 1.60934 / kph);
    opts.push({ value: secPerMile, label: `${kph.toFixed(1)} kph` });
  }
  return opts;
})();

const findClosest = (options, targetValue) =>
  options.reduce((best, opt) =>
    Math.abs(opt.value - targetValue) < Math.abs(best.value - targetValue) ? opt : best
  );

/** Intervals: 0:15 to 30:00 in 15-second steps */
const INTERVAL_OPTIONS = (() => {
  const opts = [];
  for (let s = 15; s <= 30 * 60; s += 15) {
    opts.push({ value: s, label: fmtTime(s) });
  }
  return opts;
})();

const DEFAULT_RUN_PACE  = PACE_OPTIONS.find(o => o.value === 9 * 60)  || PACE_OPTIONS[8];
const DEFAULT_WALK_PACE = PACE_OPTIONS.find(o => o.value === 15 * 60) || PACE_OPTIONS[20];
const DEFAULT_RUN_INT   = INTERVAL_OPTIONS.find(o => o.value === 60)  || INTERVAL_OPTIONS[3];
const DEFAULT_WALK_INT  = INTERVAL_OPTIONS.find(o => o.value === 60)  || INTERVAL_OPTIONS[3];

const DISTANCES = [
  { label: '1K',           miles: 0.62137 },
  { label: '1 Mile',       miles: 1 },
  { label: '5K',           miles: 3.1072 },
  { label: '10K',          miles: 6.2137 },
  { label: 'Half Marathon',miles: 13.1094 },
  { label: 'Marathon',     miles: 26.2188 },
];

// ─── Pace Mode Toggle ─────────────────────────────────────────────────────────

function PaceToggle({ mode, onChange, options = ['outdoor', 'treadmill'] }) {
  return (
    <View style={styles.toggleContainer}>
      {options.map((m) => (
        <TouchableOpacity
          key={m}
          style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
          onPress={() => onChange(m)}
          activeOpacity={0.75}
        >
          <Text style={[styles.toggleBtnText, mode === m && styles.toggleBtnTextActive]}>
            {m.toUpperCase()}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onStart }) {
  const [paceMode,    setPaceMode]    = useState('outdoor');
  const [unitMode,    setUnitMode]    = useState('mi');
  const [runPace,     setRunPace]     = useState(DEFAULT_RUN_PACE);
  const [walkPace,    setWalkPace]    = useState(DEFAULT_WALK_PACE);
  const [runInterval, setRunInterval] = useState(DEFAULT_RUN_INT);
  const [walkInterval,setWalkInterval]= useState(DEFAULT_WALK_INT);

  const getPaceOptions = (pace, unit) => {
    if (pace === 'outdoor') return unit === 'mi' ? PACE_OPTIONS : PACE_OPTIONS_KM;
    return unit === 'mi' ? MPH_OPTIONS : KPH_OPTIONS;
  };

  const paceOptions = getPaceOptions(paceMode, unitMode);

  const handlePaceModeChange = (newMode) => {
    const newOptions = getPaceOptions(newMode, unitMode);
    setPaceMode(newMode);
    setRunPace(findClosest(newOptions, runPace.value));
    setWalkPace(findClosest(newOptions, walkPace.value));
  };

  const handleUnitModeChange = (newUnit) => {
    const newOptions = getPaceOptions(paceMode, newUnit);
    setUnitMode(newUnit);
    setRunPace(findClosest(newOptions, runPace.value));
    setWalkPace(findClosest(newOptions, walkPace.value));
  };

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.setupScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.setupHeader}>
          <Text style={styles.setupEyebrow}>INTERVAL TIMER</Text>
          <Text style={styles.setupTitle}>RUN<Text style={{ color: C.accent }}>+</Text>WALK</Text>
        </View>

        {/* Pace Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PACE</Text>
          <PaceToggle mode={paceMode} onChange={handlePaceModeChange} />
          <PaceToggle mode={unitMode} onChange={handleUnitModeChange} options={['mi', 'km']} />
          <Dropdown
            label="Running Pace"
            value={runPace}
            options={paceOptions}
            onChange={setRunPace}
            color={C.run}
          />
          <Dropdown
            label="Walking Pace"
            value={walkPace}
            options={paceOptions}
            onChange={setWalkPace}
            color={C.walk}
          />
        </View>

        {/* Interval Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>INTERVALS</Text>
          <View style={styles.intervalRow}>
            <View style={styles.intervalHalf}>
              <Dropdown
                label="Run Interval"
                value={runInterval}
                options={INTERVAL_OPTIONS}
                onChange={setRunInterval}
                color={C.run}
              />
            </View>
            <View style={styles.intervalHalf}>
              <Dropdown
                label="Walk Interval"
                value={walkInterval}
                options={INTERVAL_OPTIONS}
                onChange={setWalkInterval}
                color={C.walk}
              />
            </View>
          </View>
        </View>

        {/* Distance Estimates */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DISTANCE ESTIMATES</Text>
          <View style={styles.distGrid}>
            {DISTANCES.map(d => (
              <DistanceCard
                key={d.label}
                label={d.label}
                miles={d.miles}
                runPace={runPace.value}
                walkPace={walkPace.value}
                runInterval={runInterval.value}
                walkInterval={walkInterval.value}
              />
            ))}
          </View>
        </View>

        {/* Start Button */}
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => onStart({ runPace, walkPace, runInterval, walkInterval })}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnText}>START TIMER</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Timer Screen ─────────────────────────────────────────────────────────────

const PHASE_RUN  = 'RUN';
const PHASE_WALK = 'WALK';

function TimerScreen({ config, onBack }) {
  const { runInterval, walkInterval } = config;

  const [phase,       setPhase]       = useState(PHASE_RUN);
  const [timeLeft,    setTimeLeft]    = useState(runInterval.value);
  const [running,     setRunning]     = useState(false);
  const [cycleCount,  setCycleCount]  = useState(1);       // which RUN bout we're on
  const [elapsed,     setElapsed]     = useState(0);       // total seconds elapsed

  const intervalRef = useRef(null);
  const pulseAnim   = useRef(new Animated.Value(1)).current;

  const phaseColor    = phase === PHASE_RUN ? C.run : C.walk;
  const phaseDuration = phase === PHASE_RUN ? runInterval.value : walkInterval.value;
  const progress      = 1 - timeLeft / phaseDuration;

  // Pulse animation on phase transition
  const triggerPulse = useCallback(() => {
    pulseAnim.setValue(1.15);
    Animated.spring(pulseAnim, {
      toValue: 1,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [pulseAnim]);

  const tick = useCallback(() => {
    setTimeLeft(prev => {
      if (prev <= 1) {
        // Phase transition
        Vibration.vibrate(Platform.OS === 'android' ? [0, 200, 100, 200] : [200]);
        return -1; // sentinel to trigger phase change via effect
      }
      return prev - 1;
    });
    setElapsed(e => e + 1);
  }, []);

  // Handle phase change
  useEffect(() => {
    if (timeLeft === -1) {
      setPhase(p => {
        if (p === PHASE_RUN) {
          setTimeLeft(walkInterval.value);
          triggerPulse();
          return PHASE_WALK;
        } else {
          setCycleCount(c => c + 1);
          setTimeLeft(runInterval.value);
          triggerPulse();
          return PHASE_RUN;
        }
      });
    }
  }, [timeLeft, runInterval.value, walkInterval.value, triggerPulse]);

  // Start/stop ticker
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, tick]);

  const handleStartPause = () => setRunning(r => !r);

  const handleReset = () => {
    setRunning(false);
    setPhase(PHASE_RUN);
    setTimeLeft(runInterval.value);
    setCycleCount(1);
    setElapsed(0);
  };

  // Circular progress arc (SVG-style via border trick isn't ideal; use a simple bar instead)
  const barWidth = (width - 64) * (1 - progress);

  return (
    <View style={[styles.flex, styles.timerBg]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Top bar */}
      <View style={styles.timerTopBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← SETUP</Text>
        </TouchableOpacity>
        <Text style={styles.timerElapsed}>ELAPSED  {fmtDuration(elapsed)}</Text>
      </View>

      {/* Phase label */}
      <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center' }}>
        <Text style={[styles.phaseLabel, { color: phaseColor }]}>{phase}</Text>
      </Animated.View>

      {/* Big countdown */}
      <View style={styles.countdownWrap}>
        <Text style={[styles.countdown, { color: phaseColor }]}>
          {fmtTime(Math.max(0, timeLeft))}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: barWidth, backgroundColor: phaseColor }]} />
      </View>

      {/* Cycle counter */}
      <View style={styles.cycleRow}>
        <View style={styles.cycleChip}>
          <Text style={styles.cycleChipLabel}>CYCLE</Text>
          <Text style={[styles.cycleChipValue, { color: phaseColor }]}>{cycleCount}</Text>
        </View>
        <View style={styles.cycleChip}>
          <Text style={styles.cycleChipLabel}>UP NEXT</Text>
          <Text style={[styles.cycleChipValue, { color: phase === PHASE_RUN ? C.walk : C.run }]}>
            {phase === PHASE_RUN ? 'WALK' : 'RUN'}
          </Text>
        </View>
      </View>

      {/* Interval summary */}
      <View style={styles.intervalSummary}>
        <View style={[styles.intervalBadge, { borderColor: C.run }]}>
          <Text style={[styles.intervalBadgeLabel, { color: C.run }]}>RUN</Text>
          <Text style={styles.intervalBadgeValue}>{fmtTime(runInterval.value)}</Text>
        </View>
        <View style={styles.intervalDivider} />
        <View style={[styles.intervalBadge, { borderColor: C.walk }]}>
          <Text style={[styles.intervalBadgeLabel, { color: C.walk }]}>WALK</Text>
          <Text style={styles.intervalBadgeValue}>{fmtTime(walkInterval.value)}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.75}>
          <Text style={styles.resetBtnText}>RESET</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: phaseColor }]}
          onPress={handleStartPause}
          activeOpacity={0.85}
        >
          <Text style={styles.playBtnText}>{running ? 'PAUSE' : 'START'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function RunWalkTimer() {
  const [screen, setScreen] = useState('setup'); // 'setup' | 'timer'
  const [config, setConfig] = useState(null);

  if (screen === 'timer' && config) {
    return (
      <TimerScreen
        config={config}
        onBack={() => setScreen('setup')}
      />
    );
  }

  return (
    <SetupScreen
      onStart={(cfg) => {
        setConfig(cfg);
        setScreen('timer');
      }}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },

  // ── Setup ──
  setupScroll: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 48,
  },
  setupHeader: {
    marginBottom: 36,
  },
  setupEyebrow: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 11,
    letterSpacing: 4,
    color: C.textSecondary,
    marginBottom: 4,
  },
  setupTitle: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 48,
    fontWeight: '900',
    color: C.textPrimary,
    letterSpacing: -1,
    lineHeight: 52,
  },

  section: { marginBottom: 28 },

  // ── Pace Toggle ──
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 3,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: C.accent,
  },
  toggleBtnText: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    color: C.textSecondary,
  },
  toggleBtnTextActive: {
    color: C.bg,
  },
  sectionLabel: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 10,
    letterSpacing: 3,
    color: C.textMuted,
    marginBottom: 10,
  },

  // ── Dropdown ──
  dropdown: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  dropdownLabel: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 10,
    letterSpacing: 2,
    color: C.textSecondary,
    marginBottom: 4,
  },
  dropdownValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownValue: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  dropdownChevron: {
    fontSize: 18,
    fontWeight: '700',
  },

  intervalRow: { flexDirection: 'row', gap: 10 },
  intervalHalf: { flex: 1 },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.6,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    letterSpacing: 1,
  },
  modalClose: { color: C.textSecondary, fontSize: 16 },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 52,
  },
  modalItemText: {
    color: C.textPrimary,
    fontSize: 16,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  modalCheck: { fontSize: 16, fontWeight: '700' },

  // ── Distance Grid ──
  distGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  distCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '45%',
  },
  distLabel: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 9,
    letterSpacing: 2,
    color: C.textSecondary,
    marginBottom: 4,
  },
  distValue: {
    fontSize: 20,
    fontWeight: '700',
    color: C.accent,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },

  // ── Start Button ──
  startBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  startBtnText: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },

  // ── Timer Screen ──
  timerBg: { justifyContent: 'space-between', paddingBottom: 40 },
  timerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    marginBottom: 16,
  },
  backBtn: { paddingVertical: 6 },
  backBtnText: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 12,
    letterSpacing: 2,
    color: C.textSecondary,
  },
  timerElapsed: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 11,
    letterSpacing: 2,
    color: C.textMuted,
  },

  phaseLabel: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 14,
    letterSpacing: 8,
    fontWeight: '700',
    textAlign: 'center',
  },

  countdownWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  countdown: {
    fontSize: 96,
    fontWeight: '900',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    letterSpacing: -4,
    lineHeight: 100,
  },

  progressTrack: {
    height: 4,
    backgroundColor: C.border,
    marginHorizontal: 32,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    // width set dynamically
  },

  cycleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginTop: 24,
  },
  cycleChip: { alignItems: 'center' },
  cycleChipLabel: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 9,
    letterSpacing: 3,
    color: C.textMuted,
    marginBottom: 4,
  },
  cycleChipValue: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 22,
    fontWeight: '800',
  },

  intervalSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
  },
  intervalBadge: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  intervalBadgeLabel: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 9,
    letterSpacing: 3,
    marginBottom: 2,
  },
  intervalBadgeValue: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
  },
  intervalDivider: {
    width: 1,
    height: 40,
    backgroundColor: C.border,
  },

  controls: {
    flexDirection: 'row',
    paddingHorizontal: 32,
    gap: 16,
    marginTop: 28,
    alignItems: 'center',
  },
  resetBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  resetBtnText: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 13,
    letterSpacing: 3,
    color: C.textSecondary,
  },
  playBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  playBtnText: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4,
    color: '#0D0D0D',
  },
});
