import 'dotenv/config';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { state, logAction, loadState, recordSupply, recordWithdraw, recordModeChange, recordCycle } from './state.js';
import { initWallet } from './wallet.js';
import { getVolatilityScore } from './oracle.js';
import { initLending, supplyToAave, withdrawFromAave, getAavePosition } from './lending.js';
import { initSwap, autoCompound } from './swap.js';
import { createStatusApp } from './x402.js';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USDT = process.env.USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const INTERVAL = Number(process.env.AGENT_INTERVAL_MS) || 900_000;
const PORT = Number(process.env.X402_PORT) || 3000;
const MIN_TRADE_USDT = 5_000_000n; // 5 USDT minimum to avoid wasting gas
const COMPOUND_INTERVAL = 4; // Auto-compound every 4th cycle (~1 hour)

const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];

let provider = null;

function getProvider() {
  if (!provider) provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  return provider;
}

async function getUsdtBalance(address) {
  const usdt = new ethers.Contract(USDT, USDT_ABI, getProvider());
  return usdt.balanceOf(address);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute graduated allocation percentage based on volatility.
 * Lower vol → higher allocation to Aave.
 * Returns a fraction 0.0–0.95 representing % of balance to deploy.
 */
function computeAllocation(volScore) {
  // Linear scale: 0% vol → 95% allocation, 6%+ vol → 0% allocation
  const maxVol = 0.06;
  const maxAlloc = 0.95;
  if (volScore >= maxVol) return 0;
  if (volScore <= 0) return maxAlloc;
  return maxAlloc * (1 - volScore / maxVol);
}

async function runCycle(aave, velora, address) {
  recordCycle();
  const { volScore, volatility } = await getVolatilityScore();

  let targetMode;
  if (volatility === 'LOW') targetMode = 'YIELD';
  else if (volatility === 'HIGH') targetMode = 'HOLD';
  else targetMode = state.mode;

  const modeChanged = targetMode !== state.mode;
  if (modeChanged) {
    recordModeChange();
    const previousMode = state.mode;
    state.mode = targetMode;

    if (targetMode === 'YIELD') {
      const balance = await getUsdtBalance(address);
      const allocPct = computeAllocation(volScore);
      const supplyAmount = BigInt(Math.floor(Number(balance) * allocPct));

      if (supplyAmount >= MIN_TRADE_USDT) {
        const tx = await supplyToAave(aave, supplyAmount);
        state.lastAction = 'SUPPLY';
        recordSupply(supplyAmount);
        logAction({
          action: `SUPPLY ${supplyAmount} USDT to Aave @ ${(allocPct * 100).toFixed(1)}% allocation (${previousMode}→YIELD, vol=${volScore.toFixed(4)})`,
          txHash: tx?.hash || String(tx),
          supplyAmount: supplyAmount.toString(),
        });
        return;
      } else {
        logAction({
          action: `Mode ${previousMode}→YIELD but balance too low to supply (${balance} < min ${MIN_TRADE_USDT})`,
        });
        return;
      }
    } else if (targetMode === 'HOLD') {
      try {
        const tx = await withdrawFromAave(aave, 0n);
        state.lastAction = 'WITHDRAW';
        logAction({
          action: `WITHDRAW all from Aave (${previousMode}→HOLD, vol=${volScore.toFixed(4)})`,
          txHash: tx?.hash || String(tx),
        });
        // Track withdrawn amount
        const balanceAfter = await getUsdtBalance(address);
        recordWithdraw(balanceAfter);
      } catch (err) {
        logAction({
          action: `WITHDRAW attempted but failed (${previousMode}→HOLD): ${err.message}`,
        });
      }
      return;
    }
  }

  // Auto-compound: if in YIELD mode, periodically claim/swap rewards back
  if (state.mode === 'YIELD' && state.pnl.cycleCount % COMPOUND_INTERVAL === 0) {
    try {
      const compounded = await autoCompound(velora, aave, address, getUsdtBalance);
      if (compounded) {
        logAction({
          action: `AUTO-COMPOUND: re-supplied idle USDT to Aave`,
          txHash: compounded?.hash || String(compounded),
        });
        return;
      }
    } catch (err) {
      // Non-fatal — compound is best-effort
      console.log('Auto-compound skipped:', err.message);
    }
  }

  // Rebalance: if in YIELD mode and allocation drifted, adjust
  if (state.mode === 'YIELD' && !modeChanged) {
    try {
      const balance = await getUsdtBalance(address);
      const allocPct = computeAllocation(volScore);
      const supplyAmount = BigInt(Math.floor(Number(balance) * allocPct));

      if (supplyAmount >= MIN_TRADE_USDT) {
        const tx = await supplyToAave(aave, supplyAmount);
        state.lastAction = 'REBALANCE';
        recordSupply(supplyAmount);
        logAction({
          action: `REBALANCE: supplied ${supplyAmount} idle USDT @ ${(allocPct * 100).toFixed(1)}% (vol=${volScore.toFixed(4)})`,
          txHash: tx?.hash || String(tx),
          supplyAmount: supplyAmount.toString(),
        });
        return;
      }
    } catch {
      // Non-fatal
    }
  }

  logAction({ action: `heartbeat (mode=${state.mode}, vol=${volScore.toFixed(4)}, cycles=${state.pnl.cycleCount})` });
}

async function main() {
  console.log('VolAgent starting...');

  // Ensure data directory exists for persistence
  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
  loadState();

  const { account, address } = initWallet();
  const aave = initLending(account);
  const velora = initSwap(account);

  const ctx = {
    address,
    aave,
    velora,
    runCycle: () => runCycle(aave, velora, address),
    getBalance: () => getUsdtBalance(address),
    getPosition: () => getAavePosition(aave),
    supplyToAave: (amount) => supplyToAave(aave, amount),
    withdrawFromAave: (amount) => withdrawFromAave(aave, amount),
  };

  const app = createStatusApp(ctx);
  app.listen(PORT, () => {
    console.log(`VolAgent dashboard on http://localhost:${PORT}`);
    console.log(`  /health  — health check`);
    console.log(`  /api/*   — dashboard API`);
    console.log(`  /status  — x402 paid snapshot`);
  });

  console.log(`Agent loop interval: ${INTERVAL / 1000}s`);
  console.log(`Min trade size: ${MIN_TRADE_USDT / 1_000_000n} USDT`);
  console.log(`Auto-compound every ${COMPOUND_INTERVAL} cycles`);

  while (true) {
    try {
      await runCycle(aave, velora, address);
    } catch (err) {
      console.error('Cycle error (non-fatal):', err.message);
      logAction({ action: 'cycle_error', error: err.message });
    }
    await sleep(INTERVAL);
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
