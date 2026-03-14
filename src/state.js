import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '..', 'data', 'state.json');
const MAX_LOG_ENTRIES = 1000;

export const state = {
  mode: 'HOLD',
  volScore: 0,
  lastAction: null,
  lastCheck: null,
  // P&L tracking
  pnl: {
    totalSupplied: '0',
    totalWithdrawn: '0',
    cycleCount: 0,
    modeChanges: 0,
    startedAt: null,
  },
  // Volatility history for charting
  volHistory: [],
};

export const auditLog = [];

export function logAction(entry) {
  const record = {
    timestamp: new Date().toISOString(),
    volScore: state.volScore,
    mode: state.mode,
    ...entry,
  };
  auditLog.push(record);
  if (auditLog.length > MAX_LOG_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_LOG_ENTRIES);
  }
  console.log(`[${record.timestamp}] ${record.action}`, record.txHash || '');
  persistState();
  return record;
}

export function recordVolScore(score) {
  state.volHistory.push({
    t: Date.now(),
    v: Math.round(score * 10000) / 10000,
  });
  // Keep last 200 data points (~50 hours at 15m intervals)
  if (state.volHistory.length > 200) {
    state.volHistory.splice(0, state.volHistory.length - 200);
  }
}

export function recordSupply(amount) {
  state.pnl.totalSupplied = (BigInt(state.pnl.totalSupplied) + amount).toString();
}

export function recordWithdraw(amount) {
  state.pnl.totalWithdrawn = (BigInt(state.pnl.totalWithdrawn) + amount).toString();
}

export function recordModeChange() {
  state.pnl.modeChanges++;
}

export function recordCycle() {
  state.pnl.cycleCount++;
  if (!state.pnl.startedAt) state.pnl.startedAt = new Date().toISOString();
}

export function getSnapshot() {
  return {
    ...state,
    recentLogs: auditLog.slice(-50),
  };
}

// --- Disk persistence ---

export function persistState() {
  try {
    const data = {
      mode: state.mode,
      volScore: state.volScore,
      lastAction: state.lastAction,
      lastCheck: state.lastCheck,
      pnl: state.pnl,
      volHistory: state.volHistory,
      auditLog: auditLog.slice(-200),
    };
    writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Non-fatal — data dir may not exist yet on first run
  }
}

export function loadState() {
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data.mode) state.mode = data.mode;
    if (data.volScore) state.volScore = data.volScore;
    if (data.lastAction) state.lastAction = data.lastAction;
    if (data.lastCheck) state.lastCheck = data.lastCheck;
    if (data.pnl) state.pnl = data.pnl;
    if (data.volHistory) state.volHistory = data.volHistory;
    if (data.auditLog) {
      auditLog.length = 0;
      auditLog.push(...data.auditLog);
    }
    console.error(`State restored from disk (mode=${state.mode}, cycles=${state.pnl.cycleCount})`);
  } catch {
    console.error('No previous state found, starting fresh.');
  }
}
