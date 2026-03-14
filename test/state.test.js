import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, auditLog, logAction, recordSupply, recordWithdraw, recordCycle, recordModeChange, recordVolScore, getSnapshot } from '../src/state.js';

describe('state management', () => {
  beforeEach(() => {
    state.mode = 'HOLD';
    state.volScore = 0;
    state.lastAction = null;
    state.lastCheck = null;
    state.pnl = {
      totalSupplied: '0',
      totalWithdrawn: '0',
      cycleCount: 0,
      modeChanges: 0,
      startedAt: null,
    };
    state.volHistory = [];
    auditLog.length = 0;
  });

  it('logs actions with timestamp and state', () => {
    state.mode = 'YIELD';
    state.volScore = 0.015;
    const record = logAction({ action: 'test action' });

    assert.equal(record.action, 'test action');
    assert.equal(record.mode, 'YIELD');
    assert.equal(record.volScore, 0.015);
    assert.ok(record.timestamp);
    assert.equal(auditLog.length, 1);
  });

  it('caps audit log at 1000 entries', () => {
    for (let i = 0; i < 1010; i++) {
      logAction({ action: `entry ${i}` });
    }
    assert.ok(auditLog.length <= 1000);
  });

  it('tracks P&L supply amounts', () => {
    recordSupply(5_000_000n);
    assert.equal(state.pnl.totalSupplied, '5000000');

    recordSupply(3_000_000n);
    assert.equal(state.pnl.totalSupplied, '8000000');
  });

  it('tracks P&L withdraw amounts', () => {
    recordWithdraw(10_000_000n);
    assert.equal(state.pnl.totalWithdrawn, '10000000');
  });

  it('counts cycles and mode changes', () => {
    recordCycle();
    recordCycle();
    recordCycle();
    assert.equal(state.pnl.cycleCount, 3);

    recordModeChange();
    assert.equal(state.pnl.modeChanges, 1);
  });

  it('sets startedAt on first cycle', () => {
    assert.equal(state.pnl.startedAt, null);
    recordCycle();
    assert.ok(state.pnl.startedAt);
  });

  it('records volatility history', () => {
    recordVolScore(0.023);
    recordVolScore(0.045);
    assert.equal(state.volHistory.length, 2);
    assert.equal(state.volHistory[0].v, 0.023);
    assert.equal(state.volHistory[1].v, 0.045);
  });

  it('caps vol history at 200 entries', () => {
    for (let i = 0; i < 210; i++) {
      recordVolScore(i * 0.001);
    }
    assert.ok(state.volHistory.length <= 200);
  });

  it('getSnapshot includes recent logs and state', () => {
    state.mode = 'YIELD';
    state.volScore = 0.02;
    logAction({ action: 'snap test' });

    const snap = getSnapshot();
    assert.equal(snap.mode, 'YIELD');
    assert.equal(snap.volScore, 0.02);
    assert.equal(snap.recentLogs.length, 1);
    assert.ok(snap.pnl);
    assert.ok(snap.volHistory);
  });
});
