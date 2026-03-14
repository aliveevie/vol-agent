# VolAgent — Architecture Specification
### Volatility-Driven Autonomous Treasury Agent · Tether Hackathon Galáctica WDK Edition 1

---

## 1. Overview

VolAgent is a fully autonomous, self-custodial DeFi treasury agent. It reads on-chain volatility, makes capital allocation decisions independently, executes them using WDK modules, and logs every action onchain. No human triggers needed between cycles.

**Core Loop:**
```
Read Volatility → Decide Allocation → Execute via WDK → Log → Sleep → Repeat
```

**Target Tracks:**
- 🌊 Autonomous DeFi Agent (primary — 1st place target)
- 🤖 Agent Wallets via OpenClaw/MCP (bonus coverage)

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VolAgent Node                        │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Volatility  │───▶│  Decision    │───▶│  Execution    │  │
│  │  Oracle      │    │  Engine      │    │  Layer        │  │
│  └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                                                 │           │
│                                    ┌────────────┼──────┐   │
│                                    ▼            ▼      ▼   │
│                              [Aave Lend]  [Velora Swap] │   │
│                              [WDK Lend]  [WDK Swap]    │   │
│                                                         │   │
│  ┌─────────────────────────────────────────────────┐   │   │
│  │              WDK Self-Custodial Wallet           │◀──┘   │
│  │         @tetherto/wdk-wallet-evm                 │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │           MCP Server (Agent Interface)           │       │
│  │         @tetherto/wdk-mcp-toolkit                │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │              State & Audit Log                   │       │
│  │   JSON file + x402-gated HTTP status endpoint    │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Modules & WDK Integration

### 3.1 Wallet Layer
**Package:** `@tetherto/wdk-wallet-evm`
**Docs:** https://docs.wdk.tether.io/sdk/wallet-modules

The agent holds one self-custodial EVM wallet. Seed phrase loaded from env at boot. The wallet handles all signing — Aave deposits, Velora swaps, x402 payments. Keys wiped from memory on shutdown via `close()`.

**Chain:** Polygon (low gas, Aave V3 live, USDT liquid)
**Assets held:** USDT (stable position), aUSDT (yield position)

```js
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";

const account = await new WalletManagerEvm(process.env.SEED_PHRASE, {
  provider: process.env.RPC_URL, // Polygon
}).getAccount();
```

---

### 3.2 Volatility Oracle
**No external package needed** — built custom on Chainlink price feeds (reusing VolSwap logic).

Volatility score = normalized 24h BTC price range / rolling 7-day average range.

```
vol_score = (high_24h - low_24h) / avg_7d_range
```

Thresholds:
- `vol_score < 0.5` → LOW → deploy capital into Aave
- `vol_score 0.5–1.0` → MEDIUM → hold, auto-compound
- `vol_score > 1.0` → HIGH → withdraw from Aave, hold USDT

Chainlink BTC/USD feed on Polygon: `0xc907E116054Ad103354f2D350FD2514433D57F6f`

---

### 3.3 Lending (Aave V3)
**Package:** `@tetherto/wdk-protocol-lending-aave-evm`
**Docs:** https://docs.wdk.tether.io/sdk/lending-modules

When volatility is LOW, the agent deposits USDT into Aave V3 to earn yield. When volatility spikes HIGH, it withdraws automatically.

```js
import AaveProtocolEvm from "@tetherto/wdk-protocol-lending-aave-evm";

const aave = new AaveProtocolEvm(account, { network: "polygon" });

// Deposit USDT into Aave
await aave.supply({ token: USDT_ADDRESS, amount: depositAmount });

// Withdraw when vol spikes
await aave.withdraw({ token: USDT_ADDRESS, amount: withdrawAmount });

// Check current yield
const position = await aave.getPosition({ token: USDT_ADDRESS });
```

---

### 3.4 Swap Layer (Velora)
**Package:** `@tetherto/wdk-protocol-swap-velora-evm`
**Docs:** https://docs.wdk.tether.io/sdk/swap-modules

Used for two purposes:
1. Rebalancing between USDT and WETH when the agent runs multi-asset mode
2. Auto-compounding: swap accrued aUSDT rewards back to USDT before redeposit

```js
import VeloraProtocolEvm from "@tetherto/wdk-protocol-swap-velora-evm";

const swap = new VeloraProtocolEvm(account, { network: "polygon" });

const quote = await swap.getQuote({
  tokenIn: WETH_ADDRESS,
  tokenOut: USDT_ADDRESS,
  amountIn: amount,
});

await swap.swap({
  tokenIn: WETH_ADDRESS,
  tokenOut: USDT_ADDRESS,
  amountIn: amount,
  minAmountOut: quote.amountOut * 0.995n, // 0.5% slippage
});
```

---

### 3.5 MCP Server (Agent Interface)
**Package:** `@tetherto/wdk-mcp-toolkit`
**Docs:** https://docs.wdk.tether.io/ai/mcp-toolkit

Exposes the agent's wallet to any MCP-compatible client (OpenClaw, Claude Code, Cursor). Judges can interact with the live agent through their own AI assistant.

35 built-in tools: check balances, read positions, query history, initiate manual override.

Write ops (send, swap, lend) require explicit confirmation via MCP elicitations — satisfying the hackathon's safety requirements.

```js
import { WdkMcpServer } from "@tetherto/wdk-mcp-toolkit";

const mcp = new WdkMcpServer({
  wallet: account,
  capabilities: ["wallet", "lending", "swap"],
});

mcp.start({ port: 3001 });
```

**Config for judges to connect:**
```json
{
  "mcpServers": {
    "volagent": {
      "url": "http://volagent.ibxlab.com:3001/mcp"
    }
  }
}
```

---

### 3.6 x402 Status Endpoint (Bonus)
**Docs:** https://docs.wdk.tether.io/ai/x402

The agent exposes a live status API (positions, vol score, P&L, decision log) behind an x402 paywall — 0.001 USDT per request. This demonstrates agents paying agents: an external AI agent can query VolAgent's state by paying micro-USDT over HTTP with no API keys.

```js
import { paymentMiddleware } from "@x402/express";

app.use(paymentMiddleware({
  "GET /status": {
    accepts: [{ scheme: "exact", network: "eip155:9745", // Plasma
      price: { amount: "1000", asset: USDT0_PLASMA },
      payTo: agentAddress
    }]
  }
}));

app.get("/status", (req, res) => {
  res.json(agentState.getSnapshot());
});
```

---

### 3.7 OpenClaw Integration
**Docs:** https://docs.wdk.tether.io/ai/openclaw

Install the WDK skill into OpenClaw so users can spin up their own VolAgent via natural language:

```bash
npx skills add tetherto/wdk-agent-skills
```

Example OpenClaw prompt that launches VolAgent:
```
Create a volatility-aware treasury agent. 
When BTC 24h vol > 5%, hold USDT. 
When vol < 3%, deposit to Aave on Polygon for yield.
Auto-compound every 24 hours.
```

---

## 4. Decision Engine

```
Every 15 minutes:
  1. Fetch Chainlink BTC/USD prices (current + 24h history)
  2. Compute vol_score
  3. Compare to current STATE (LOW / MEDIUM / HIGH)
  4. If state UNCHANGED → skip execution, log heartbeat
  5. If state CHANGED:
       LOW   → aave.supply(availableUSDT * 0.90)
       HIGH  → aave.withdraw(fullAavePosition)
       MEDIUM → no action, hold
  6. Log decision to audit trail (timestamp, vol_score, action, txHash)
  7. Expose updated state via /status endpoint
```

State machine transitions:
```
         HIGH vol              LOW vol
HOLD ──────────────▶ HOLD  ◀──────────── YIELD
 ▲                                           │
 └───────────────────────────────────────────┘
         HIGH vol spike
```

---

## 5. Folder Structure

```
volagent/
├── src/
│   ├── agent.js          # Main decision loop
│   ├── oracle.js         # Volatility calculator (Chainlink)
│   ├── wallet.js         # WDK wallet init
│   ├── lending.js        # Aave module wrapper
│   ├── swap.js           # Velora module wrapper
│   ├── mcp.js            # WDK MCP server
│   ├── x402.js           # x402 status endpoint
│   └── state.js          # In-memory state + audit log
├── dashboard/            # Minimal React UI (status only)
│   └── App.jsx
├── .env.example
├── CLAUDE.md             # WDK project rules for Claude Code
└── README.md
```

---

## 6. Tech Stack

| Layer | Package | Docs |
|-------|---------|------|
| Wallet | `@tetherto/wdk-wallet-evm` | https://docs.wdk.tether.io/sdk/wallet-modules |
| Lending | `@tetherto/wdk-protocol-lending-aave-evm` | https://docs.wdk.tether.io/sdk/lending-modules |
| Swap | `@tetherto/wdk-protocol-swap-velora-evm` | https://docs.wdk.tether.io/sdk/swap-modules |
| MCP Interface | `@tetherto/wdk-mcp-toolkit` | https://docs.wdk.tether.io/ai/mcp-toolkit |
| Agent Shell | OpenClaw + WDK skill | https://docs.wdk.tether.io/ai/openclaw |
| Payments | x402 + `@x402/express` | https://docs.wdk.tether.io/ai/x402 |
| Oracle | Chainlink BTC/USD on Polygon | — |
| Runtime | Node.js | https://docs.wdk.tether.io/start-building/nodejs-bare-quickstart |
| AI context | WDK MCP Docs server | https://docs.wdk.tether.io/start-building/build-with-ai |

---

## 7. Build Plan (11 Days)

| Day | Focus |
|-----|-------|
| 1 | WDK wallet init, Chainlink oracle, vol_score working |
| 2–3 | Aave lending module — supply/withdraw/position read |
| 4 | Decision engine loop, state machine, audit log |
| 5 | Velora swap integration, auto-compound logic |
| 6 | MCP server up, test with Claude Code |
| 7 | x402 status endpoint live on Plasma |
| 8 | OpenClaw integration, WDK skill |
| 9 | Dashboard (minimal React, just status + P&L) |
| 10 | Testnet end-to-end run, record demo video |
| 11 | Polish README, submit |

---

## 8. Judging Criteria Map

| Criterion | VolAgent Coverage |
|-----------|------------------|
| Technical correctness | WDK wallet + Aave + Velora + MCP + x402 — full stack integration |
| Degree of autonomy | 15-min decision loops, zero human triggers, state machine with guards |
| Economic soundness | USDT in/out of Aave, slippage protection, auto-compound, x402 micro-revenue |
| Real-world applicability | Treasury bots are a live market need; this is deployable today |

---

*Built with IBX Lab · Tether Hackathon Galáctica WDK Edition 1 · March 2026*
