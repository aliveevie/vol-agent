import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyVolatility } from '../src/oracle.js';

describe('classifyVolatility', () => {
  describe('from HOLD mode', () => {
    it('stays HOLD at moderate volatility', () => {
      assert.equal(classifyVolatility(0.03, 'HOLD'), 'HIGH');
    });

    it('transitions to LOW only below exit threshold (1.5%)', () => {
      assert.equal(classifyVolatility(0.014, 'HOLD'), 'LOW');
    });

    it('stays HOLD at 2% (above exit threshold)', () => {
      assert.equal(classifyVolatility(0.02, 'HOLD'), 'HIGH');
    });

    it('stays HOLD at exactly 1.5% boundary', () => {
      assert.equal(classifyVolatility(0.015, 'HOLD'), 'LOW');
    });
  });

  describe('from YIELD mode', () => {
    it('stays YIELD at moderate volatility', () => {
      assert.equal(classifyVolatility(0.03, 'YIELD'), 'LOW');
    });

    it('transitions to HIGH only above exit threshold (6%)', () => {
      assert.equal(classifyVolatility(0.061, 'YIELD'), 'HIGH');
    });

    it('stays YIELD at 5% (below exit threshold)', () => {
      assert.equal(classifyVolatility(0.05, 'YIELD'), 'LOW');
    });

    it('transitions to HIGH at exactly 6%', () => {
      assert.equal(classifyVolatility(0.06, 'YIELD'), 'HIGH');
    });
  });

  describe('hysteresis prevents oscillation', () => {
    it('vol at 2% stays in current mode (no flip-flop)', () => {
      // From YIELD: stays LOW (still yielding)
      assert.equal(classifyVolatility(0.02, 'YIELD'), 'LOW');
      // From HOLD: stays HIGH (still holding)
      assert.equal(classifyVolatility(0.02, 'HOLD'), 'HIGH');
    });

    it('vol at 5% stays in current mode', () => {
      assert.equal(classifyVolatility(0.05, 'YIELD'), 'LOW');
      assert.equal(classifyVolatility(0.05, 'HOLD'), 'HIGH');
    });
  });

  describe('initial state (unknown mode)', () => {
    it('classifies low vol as LOW', () => {
      assert.equal(classifyVolatility(0.01, 'INIT'), 'LOW');
    });

    it('classifies high vol as HIGH', () => {
      assert.equal(classifyVolatility(0.07, 'INIT'), 'HIGH');
    });

    it('classifies mid vol as MEDIUM', () => {
      assert.equal(classifyVolatility(0.03, 'INIT'), 'MEDIUM');
    });
  });
});
