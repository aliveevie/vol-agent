import { ethers } from 'ethers';
import { state, recordVolScore } from './state.js';

const AGGREGATOR_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function getRoundData(uint80 _roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
];

const TWENTY_FOUR_HOURS = 24 * 60 * 60;

// Hysteresis thresholds — prevents oscillation at boundaries
const ENTER_YIELD_THRESHOLD = 0.015; // Enter YIELD below 1.5%
const EXIT_YIELD_THRESHOLD = 0.06;   // Exit YIELD above 6%
const ENTER_HOLD_THRESHOLD = 0.06;   // Enter HOLD above 6%
const EXIT_HOLD_THRESHOLD = 0.015;   // Exit HOLD below 1.5%

let cachedProvider = null;

function getProvider() {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  return cachedProvider;
}

/**
 * Decode Chainlink proxy round ID into phase and aggregator round.
 * Proxy roundId = (phaseId << 64) | aggregatorRoundId
 */
function decodeRoundId(roundId) {
  const phase = roundId >> 64n;
  const aggRound = roundId & ((1n << 64n) - 1n);
  return { phase, aggRound };
}

function encodeRoundId(phase, aggRound) {
  return (phase << 64n) | aggRound;
}

export async function getVolatilityScore() {
  try {
    const provider = getProvider();
    const feed = new ethers.Contract(
      process.env.CHAINLINK_BTC_USD,
      AGGREGATOR_ABI,
      provider
    );

    const latest = await feed.latestRoundData();
    const currentPrice = Number(latest.answer);
    const latestRoundId = BigInt(latest.roundId);
    const now = Number(latest.updatedAt);
    const cutoff = now - TWENTY_FOUR_HOURS;

    const { phase, aggRound } = decodeRoundId(latestRoundId);

    let high = currentPrice;
    let low = currentPrice;
    const prices = [{ price: currentPrice, ts: now }];

    // Walk backwards through rounds using correct phase-aware IDs
    // Sample every 1st round for accuracy, cap at 30 RPC calls
    const maxSamples = 30;
    let sampled = 0;

    for (let i = 1n; sampled < maxSamples; i++) {
      if (aggRound - i <= 0n) break;
      const roundId = encodeRoundId(phase, aggRound - i);

      try {
        const round = await feed.getRoundData(roundId);
        const ts = Number(round.updatedAt);
        if (ts === 0 || ts < cutoff) break;

        const price = Number(round.answer);
        if (price > high) high = price;
        if (price < low) low = price;
        prices.push({ price, ts });
        sampled++;
      } catch {
        break;
      }
    }

    const volScore = currentPrice > 0 ? (high - low) / currentPrice : 0;

    // Classify with hysteresis based on current mode
    const volatility = classifyVolatility(volScore, state.mode);

    state.volScore = volScore;
    state.lastCheck = new Date().toISOString();
    recordVolScore(volScore);

    console.log(
      `Volatility: ${volatility} (score=${volScore.toFixed(4)}, high=${high}, low=${low}, ` +
      `price=${currentPrice}, samples=${sampled + 1})`
    );

    return { volScore, volatility, currentPrice, high, low, samples: sampled + 1 };
  } catch (err) {
    console.error('Oracle error, using previous score:', err.message);
    const volScore = state.volScore;
    const volatility = classifyVolatility(volScore, state.mode);
    return { volScore, volatility, currentPrice: 0, high: 0, low: 0, samples: 0 };
  }
}

/**
 * Classify volatility with hysteresis to prevent threshold oscillation.
 * Transitions require crossing a wider band than entry thresholds.
 */
export function classifyVolatility(volScore, currentMode) {
  if (currentMode === 'YIELD') {
    // Stay in YIELD unless vol spikes above EXIT threshold
    if (volScore >= EXIT_YIELD_THRESHOLD) return 'HIGH';
    return 'LOW';
  }
  if (currentMode === 'HOLD') {
    // Stay in HOLD unless vol drops below EXIT threshold
    if (volScore <= EXIT_HOLD_THRESHOLD) return 'LOW';
    return 'HIGH';
  }
  // Default classification for initial state
  if (volScore < ENTER_YIELD_THRESHOLD) return 'LOW';
  if (volScore >= ENTER_HOLD_THRESHOLD) return 'HIGH';
  return 'MEDIUM';
}
