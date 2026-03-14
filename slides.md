---
marp: true
theme: default
paginate: true
backgroundColor: #0a0a0a
color: #e0e0e0
style: |
  section {
    font-family: 'Inter', 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
  }
  h1 { color: #00d4aa; font-size: 2.2em; }
  h2 { color: #00d4aa; font-size: 1.6em; }
  h3 { color: #7efacc; }
  strong { color: #00d4aa; }
  code { background: #1e1e2e; color: #7efacc; padding: 2px 6px; border-radius: 4px; }
  a { color: #4ecdc4; }
  table { font-size: 0.85em; }
  th { background: #1a1a2e; color: #00d4aa; }
  td { background: #111122; }
  blockquote { border-left: 4px solid #00d4aa; background: #111122; padding: 12px 20px; font-style: italic; }
  img[alt~="center"] { display: block; margin: 0 auto; }
---

# VolAgent

### Volatility-Driven Autonomous Treasury Agent

Built with **Tether WDK** | Ethereum Sepolia

<br>

```
Read Volatility  -->  Decide  -->  Execute  -->  Compound  -->  Repeat
```

<br>

**IBX Lab** · Tether Hackathon Galactica WDK Edition 1

---

# The Problem

### DeFi treasury management is broken

- **Manual monitoring** — humans watch charts 24/7, react slowly, miss opportunities
- **Binary bots** — simple threshold bots flip-flop at boundaries, **wasting gas** on oscillation
- **Custodial risk** — most yield aggregators require handing over your keys
- **No AI interoperability** — existing bots are black boxes, no standard interface for AI agents

<br>

> A treasury sitting idle in USDT earns **0%**. The same treasury deployed to Aave during low-volatility periods could earn **3-8% APY** — but only if you act at the right time.

---

# The Cost of Getting It Wrong

### Why simple threshold bots fail

```
Volatility at 1.9% → Bot deposits to Aave       (gas: $2)
Volatility at 2.1% → Bot withdraws from Aave     (gas: $2)
Volatility at 1.8% → Bot deposits again           (gas: $2)
Volatility at 2.0% → Bot withdraws again           (gas: $2)

4 transactions × $2 gas = $8 lost in minutes
Yield earned = $0
```

This is the **#1 gas-wasting bug** in DeFi automation.

We solved it.

---

# The Solution: VolAgent

### A fully autonomous, self-custodial treasury agent

| Feature | How |
|---------|-----|
| **Reads volatility** | Chainlink BTC/USD oracle, phase-aware round IDs |
| **Decides with intelligence** | Hysteresis bands + graduated allocation |
| **Executes via WDK** | Aave V3 supply/withdraw, Velora swap |
| **Self-custodial** | `PrivateKeySignerEvm` — your keys, always |
| **Auto-compounds** | Idle USDT re-deployed every 4th cycle |
| **AI-accessible** | 9-tool MCP server for any AI client |
| **Monetizable** | x402 paid status endpoint |
| **Observable** | React dashboard with live charts + audit log |

---

# Architecture

```
                         VolAgent Node
  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐
  │  Chainlink   │───>│  Decision    │───>│  Execution    │
  │  BTC/USD     │    │  Engine      │    │  Layer        │
  │  (24h vol)   │    │  (hysteresis │    │               │
  └─────────────┘    │  + graduated │    └───────┬───────┘
                     │  allocation) │            │
                     └──────────────┘   ┌────────┼──────┐
                                        v        v      v
                                  [Aave V3] [Velora] [Auto-
                                  [Supply/   [Swap]   Compound]
                                   Withdraw]
                                        │        │
                         ┌──────────────┴────────┘
                         v
              WDK Self-Custodial Wallet
             (PrivateKeySignerEvm)

  React Dashboard   ─── live UI + vol chart + P&L
  MCP Server        ─── 9 tools for AI clients
  x402 /status      ─── paid agent snapshot
```

---

# Hysteresis: The Secret Sauce

### Two thresholds, not one — eliminates oscillation

```
           ENTER YIELD              EXIT YIELD
Vol ──────────┬──────────────────────────┬──────────
              │                          │
         1.5% ▼                     6.0% ▼
              │                          │
              │    ┌── DEAD ZONE ──┐     │
              │    │  Agent holds  │     │
              │    │  its current  │     │
              │    │  position     │     │
              │    └───────────────┘     │
```

- **Below 1.5%** → Enter YIELD mode (deploy capital)
- **Above 6.0%** → Enter HOLD mode (withdraw capital)
- **Between 1.5% and 6.0%** → **No action** — hold current position

Zero unnecessary transactions. Zero wasted gas.

---

# Graduated Allocation

### Not all-or-nothing — confidence-scaled deployment

```
allocation = (1 - volScore / 0.06) × 95%
```

| Volatility | Capital Deployed | Reasoning |
|-----------|-----------------|-----------|
| **0.0%** | 95% | Maximum confidence — near-full deployment |
| **1.0%** | 79% | High confidence — most capital deployed |
| **3.0%** | 47.5% | Moderate — half deployed |
| **5.0%** | 16% | Low confidence — mostly in reserve |
| **6.0%+** | 0% | High vol — full withdrawal |

**Minimum trade: 5 USDT** — prevents micro-transactions that cost more in gas than they earn.

---

# WDK Integration — Full Stack

### Every execution goes through Tether WDK modules

```js
// Wallet — self-custodial, private key
import { PrivateKeySignerEvm } from '@tetherto/wdk-wallet-evm/signers';
const signer = new PrivateKeySignerEvm(process.env.PRIVATE_KEY);
const account = new WalletAccountEvm(signer, { provider: RPC_URL });

// Lending — Aave V3 via WDK
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm';
const aave = new AaveProtocolEvm(account);
await aave.supply({ token: USDT, amount: 50_000_000n }); // 50 USDT

// Swap — Velora DEX via WDK
import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm';
const velora = new VeloraProtocolEvm(account, { swapMaxFee: 200000000000000n });
await velora.swap({ tokenIn, tokenOut, amountIn, minAmountOut });
```

---

# MCP Server — AI Talks to AI

### 9 tools accessible from any MCP-compatible client

```json
{
  "mcpServers": {
    "volagent": {
      "command": "node",
      "args": ["src/mcp.js"]
    }
  }
}
```

| Tool | What it does |
|------|-------------|
| `get_agent_status` | Full state, P&L, vol history, audit log |
| `get_volatility` | Live BTC/USD vol from Chainlink |
| `get_wallet_address` | Agent wallet on Sepolia |
| `get_usdt_balance` | Current USDT balance |
| `get_aave_position` | Collateral, debt, health factor |
| `supply_to_aave` | Deploy USDT to Aave V3 |
| `withdraw_from_aave` | Pull USDT from Aave V3 |
| `get_swap_quote` | Quote a Velora swap |
| `execute_swap` | Swap with slippage protection |

---

# x402 — Agent Pays Agent

### Monetize your agent's intelligence

```
GET /status   →   x402 paywall   →   0.10 USDT   →   Agent snapshot
```

- External AI agents can **pay micro-USDT** to query VolAgent's state
- No API keys, no OAuth — just **HTTP + on-chain payment**
- Built with `@x402/express` + `@x402/evm`
- Agent earns revenue while running autonomously

<br>

> An agent that makes money while it manages money.

---

# React Dashboard

### Full observability — no black boxes

**Live panels:**
- **Volatility chart** — real-time BTC vol with YIELD/HOLD threshold lines
- **Agent status** — current mode, vol score, cycle count, mode changes
- **Wallet & P&L** — balance, total supplied, total withdrawn, running since
- **Aave V3 position** — collateral, available borrows, health factor
- **Audit log** — every decision with timestamp and tx links
- **Manual controls** — Run Cycle, Force Supply, Force Withdraw

<br>

```
npm start → http://localhost:3000
```

---

# Auto-Compound

### Idle capital is a waste

Every **4th cycle**, VolAgent checks for idle USDT sitting in the wallet and automatically re-supplies it to Aave.

```
Cycle 1: Decision cycle — supply 47 USDT to Aave
Cycle 2: Decision cycle — no action needed
Cycle 3: Decision cycle — no action needed
Cycle 4: AUTO-COMPOUND — re-deploy 3.2 USDT idle balance to Aave
```

- Only compounds if idle balance > **5 USDT** (min trade size)
- Maximizes capital efficiency without extra gas waste
- Fully logged in audit trail

---

# Safety & Reliability

### The agent must never crash

| Guard | Implementation |
|-------|---------------|
| **Try/catch every cycle** | Errors logged, next cycle runs normally |
| **Hysteresis** | No flip-flop oscillation |
| **Min trade size** | 5 USDT minimum prevents dust transactions |
| **Slippage protection** | 0.5% max slippage on all swaps |
| **Concurrency guard** | One operation at a time, no race conditions |
| **Disk persistence** | State survives restarts — mode, P&L, history |
| **Self-custodial** | Private key never leaves the machine |
| **22 unit tests** | Oracle hysteresis + state management fully tested |

---

# P&L Tracking

### Every number is accounted for

```json
{
  "totalSupplied": "150000000",
  "totalWithdrawn": "45000000",
  "cycleCount": 347,
  "modeChanges": 12,
  "startedAt": "2026-03-01T00:00:00.000Z"
}
```

- **Total supplied** — cumulative USDT sent to Aave
- **Total withdrawn** — cumulative USDT pulled from Aave
- **Net yield** = withdrawn - supplied (when positive)
- **Cycle count** — how many decision loops executed
- **Mode changes** — how many HOLD/YIELD transitions
- All persisted to disk, visible on dashboard and via MCP

---

# Tech Stack

| Layer | Technology |
|-------|-----------|
| **Wallet** | `@tetherto/wdk-wallet-evm` (PrivateKeySignerEvm) |
| **Lending** | `@tetherto/wdk-protocol-lending-aave-evm` (Aave V3) |
| **Swap** | `@tetherto/wdk-protocol-swap-velora-evm` (Velora) |
| **MCP** | `@modelcontextprotocol/sdk` (9 tools, stdio) |
| **Payments** | `@x402/express` + `@x402/evm` |
| **Oracle** | Chainlink BTC/USD (phase-aware rounds) |
| **Dashboard** | React 19 + Vite 6 |
| **Runtime** | Node.js (ESM) |
| **Network** | Ethereum Sepolia (testnet) |
| **Tests** | Node.js built-in test runner (22 tests) |

---

# Why VolAgent Wins

### Tracks covered

| Track | Coverage |
|-------|---------|
| **Best Projects Overall** | Full WDK integration: wallet + lending + swap + MCP + x402 |
| **Lending Bot** | Aave V3 with hysteresis + graduated allocation + auto-compound |
| **Autonomous DeFi Agent** | Zero human intervention, 15-min decision loops, disk persistence |

### Differentiators

- **Not a toy** — graduated allocation, hysteresis, auto-compound, P&L
- **Not a black box** — React dashboard, MCP server, full audit log
- **Not custodial** — self-custodial WDK wallet, private key never exposed
- **Not fragile** — 22 tests, crash-proof loops, state persistence
- **AI-native** — any MCP client can operate the agent

---

# Demo

### See it live

```bash
# Start the agent + dashboard
npm start

# Open the dashboard
open http://localhost:3000

# Connect via MCP (Cursor/Claude Code)
"What's the current volatility?"
"Show me the agent status"
"Supply 10 USDT to Aave"

# Run tests
npm test   # 22 tests, all passing
```

<br>

**Built with IBX Lab for Tether Hackathon Galactica WDK Edition 1**

---

# Thank You

<br>

### VolAgent

*Autonomous treasury management, powered by Tether WDK*

<br>

**GitHub** · vol-agent
**Dashboard** · http://localhost:3000
**MCP** · `node src/mcp.js`

<br>

Questions?
