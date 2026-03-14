import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm';
import { supplyToAave } from './lending.js';

const USDT = process.env.USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const MIN_COMPOUND_AMOUNT = 1_000_000n; // 1 USDT minimum for compounding

export function initSwap(account) {
  return new VeloraProtocolEvm(account, {
    swapMaxFee: 200000000000000n,
  });
}

/**
 * Auto-compound: check for idle USDT in wallet and re-supply to Aave.
 * In a full implementation this would also swap any accrued reward tokens
 * back to USDT via Velora before re-supplying.
 */
export async function autoCompound(velora, aave, address, getUsdtBalance) {
  const balance = await getUsdtBalance(address);

  if (balance < MIN_COMPOUND_AMOUNT) {
    return null; // Nothing to compound
  }

  // Keep a small buffer for gas, compound the rest
  const compoundAmount = (balance * 90n) / 100n;
  if (compoundAmount < MIN_COMPOUND_AMOUNT) return null;

  console.log(`Auto-compounding ${compoundAmount} USDT back into Aave...`);
  const tx = await supplyToAave(aave, compoundAmount);
  return tx;
}

/**
 * Swap tokens via Velora with slippage protection.
 */
export async function swapTokens(velora, tokenIn, tokenOut, amountIn, maxSlippageBps = 50) {
  const quote = await velora.quoteSwap({ tokenIn, tokenOut, amountIn });
  const minOut = (BigInt(quote.amountOut) * BigInt(10000 - maxSlippageBps)) / 10000n;

  console.log(`Swap ${amountIn} ${tokenIn} → ${tokenOut}, minOut=${minOut}`);
  const tx = await velora.swap({
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut: minOut,
  });
  return tx;
}
