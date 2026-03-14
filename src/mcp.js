import dotenv from 'dotenv';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import { PrivateKeySignerEvm } from '@tetherto/wdk-wallet-evm/signers';
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm';
import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm';
import { ethers } from 'ethers';
import { state, getSnapshot, loadState } from './state.js';
import { getVolatilityScore } from './oracle.js';
const USDT = process.env.USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];

const bigIntReplacer = (_, v) => (typeof v === 'bigint' ? v.toString() : v);

let account, aave, velora, address, provider;

function initModules() {
  const signer = new PrivateKeySignerEvm(process.env.PRIVATE_KEY);
  account = new WalletAccountEvm(signer, { provider: process.env.RPC_URL });
  address = signer.address;
  provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  aave = new AaveProtocolEvm(account);
  velora = new VeloraProtocolEvm(account, { swapMaxFee: 200000000000000n });
}

async function main() {
  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
  loadState();
  initModules();

  const server = new McpServer({ name: 'volagent', version: '1.0.0' });

  // --- Agent state tools ---

  server.tool('get_agent_status', 'Get the full agent state: mode, volatility, P&L, and recent logs', {}, async () => {
    const snapshot = getSnapshot();
    return { content: [{ type: 'text', text: JSON.stringify({ ...snapshot, address }, bigIntReplacer) }] };
  });

  server.tool('get_volatility', 'Fetch live BTC/USD volatility score from Chainlink oracle', {}, async () => {
    const vol = await getVolatilityScore();
    return { content: [{ type: 'text', text: JSON.stringify(vol, bigIntReplacer) }] };
  });

  // --- Wallet tools ---

  server.tool('get_wallet_address', 'Get the agent wallet address on Sepolia', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify({ address, network: 'sepolia', chainId: 11155111 }) }],
  }));

  server.tool('get_usdt_balance', 'Get USDT balance of the agent wallet', {}, async () => {
    const usdt = new ethers.Contract(USDT, USDT_ABI, provider);
    const balance = await usdt.balanceOf(address);
    return { content: [{ type: 'text', text: JSON.stringify({ balance: balance.toString(), decimals: 6, formatted: `${Number(balance) / 1e6} USDT` }) }] };
  });

  // --- Aave tools ---

  server.tool('get_aave_position', 'Get current Aave V3 lending position on Sepolia', {}, async () => {
    const data = await aave.getAccountData();
    return { content: [{ type: 'text', text: JSON.stringify(data, bigIntReplacer) }] };
  });

  server.tool(
    'supply_to_aave',
    'Supply USDT to Aave V3 for yield',
    { amount: z.string().describe('Amount in USDT base units (6 decimals). Example: "1000000" = 1 USDT') },
    async ({ amount }) => {
      const tx = await aave.supply({ token: USDT, amount: BigInt(amount) });
      return { content: [{ type: 'text', text: JSON.stringify({ action: 'supply', amount, txHash: tx?.hash || String(tx) }) }] };
    }
  );

  server.tool(
    'withdraw_from_aave',
    'Withdraw USDT from Aave V3',
    { amount: z.string().describe('Amount in USDT base units, or "max" for all') },
    async ({ amount }) => {
      const withdrawAmount = amount === 'max' ? 2n ** 256n - 1n : BigInt(amount);
      const tx = await aave.withdraw({ token: USDT, amount: withdrawAmount });
      return { content: [{ type: 'text', text: JSON.stringify({ action: 'withdraw', amount, txHash: tx?.hash || String(tx) }) }] };
    }
  );

  // --- Swap tools ---

  server.tool(
    'get_swap_quote',
    'Get a quote for swapping tokens via Velora DEX',
    {
      tokenIn: z.string().describe('Input token address'),
      tokenOut: z.string().describe('Output token address'),
      amountIn: z.string().describe('Input amount in base units'),
    },
    async ({ tokenIn, tokenOut, amountIn }) => {
      const quote = await velora.quoteSwap({ tokenIn, tokenOut, amountIn: BigInt(amountIn) });
      return { content: [{ type: 'text', text: JSON.stringify(quote, bigIntReplacer) }] };
    }
  );

  server.tool(
    'execute_swap',
    'Execute a token swap via Velora DEX with slippage protection',
    {
      tokenIn: z.string().describe('Input token address'),
      tokenOut: z.string().describe('Output token address'),
      amountIn: z.string().describe('Input amount in base units'),
      maxSlippageBps: z.string().optional().describe('Max slippage in basis points (default 50 = 0.5%)'),
    },
    async ({ tokenIn, tokenOut, amountIn, maxSlippageBps }) => {
      const slippage = maxSlippageBps ? Number(maxSlippageBps) : 50;
      const quote = await velora.quoteSwap({ tokenIn, tokenOut, amountIn: BigInt(amountIn) });
      const minOut = (BigInt(quote.amountOut) * BigInt(10000 - slippage)) / 10000n;
      const tx = await velora.swap({ tokenIn, tokenOut, amountIn: BigInt(amountIn), minAmountOut: minOut });
      return { content: [{ type: 'text', text: JSON.stringify({ action: 'swap', txHash: tx?.hash || String(tx), minAmountOut: minOut.toString() }) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('VolAgent MCP server started (stdio) — 9 tools registered');
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
