<p align="center">
  <h1 align="center">VolAgent</h1>
  <p align="center">
    <strong>Volatility-Driven Autonomous Treasury Agent</strong>
    <br />
    Built with <a href="https://docs.wdk.tether.io">Tether WDK</a> on Ethereum Sepolia
    <br /><br />
    <a href="https://github.com/aliveevie/vol-agent">GitHub</a>
    &nbsp;&middot;&nbsp;
    <a href="https://youtu.be/k5T8s44B6QE">Demo Video</a>
  </p>
</p>

<br />

> **VolAgent** reads on-chain BTC volatility via Chainlink, makes graduated capital allocation decisions with hysteresis, executes via Aave V3 and Velora using Tether WDK, auto-compounds idle capital, and tracks P&L — all without human intervention.

<br />

<p align="center">
  <a href="https://youtu.be/k5T8s44B6QE">
    <img src="https://img.shields.io/badge/%E2%96%B6%EF%B8%8F_Watch_Demo-YouTube-red?style=for-the-badge&logo=youtube" alt="Watch Demo on YouTube" />
  </a>
</p>

---

## The Problem

DeFi treasuries bleed money from inaction and bad automation:

- **Idle capital earns 0%** — USDT sitting in a wallet while Aave offers 3–8% APY
- **Simple threshold bots oscillate** — a bot with a 2% trigger deposits at 1.9%, withdraws at 2.1%, deposits again at 1.8%... burning gas, earning nothing
- **Custodial risk** — most yield aggregators require handing over your keys
- **No AI interop** — existing bots are black boxes with no standard interface

## The Solution

VolAgent is a **fully autonomous, self-custodial treasury agent** that solves all of the above:

| Capability | How |
|-----------|-----|
| Reads volatility | Chainlink BTC/USD oracle with phase-aware round IDs |
| Eliminates oscillation | Hysteresis bands (1.5%–6% dead zone) |
| Scales with confidence | Graduated allocation: `(1 - vol/0.06) x 95%` |
| Executes via WDK | Aave V3 supply/withdraw + Velora swap |
| Self-custodial | `PrivateKeySignerEvm` — your keys, always |
| Auto-compounds | Idle USDT re-deployed every 4th cycle |
| AI-accessible | 9-tool MCP server for Cursor, Claude Code, any MCP client |
| Monetizable | x402 paid status endpoint — agents pay agents |
| Observable | React dashboard with live charts, P&L, audit log |
| Reliable | 22 tests, crash-proof loops, disk persistence |

---

## Demo

<p align="center">
  <a href="https://youtu.be/k5T8s44B6QE">
    <img src="https://img.shields.io/badge/%E2%96%B6%EF%B8%8F_Watch_the_Full_Demo-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Demo Video" />
  </a>
</p>

See VolAgent in action: the agent reading live volatility, making allocation decisions, supplying to Aave V3, the React dashboard updating in real-time, and MCP tools being called from an AI client.

---

## Architecture

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

  React Dashboard   ─── live UI + vol chart + P&L + controls
  MCP Server (stdio) ─── 9 tools for AI clients
  x402 /status       ─── paid agent snapshot
  Disk Persistence   ─── state survives restarts
```

---

## Decision Engine

The agent uses a **graduated allocation model with hysteresis** — not a simple if/else toggle.

### Hysteresis Bands

Prevents threshold oscillation (the #1 gas-wasting bug in DeFi bots):

| Transition | Threshold | Effect |
|-----------|-----------|--------|
| Enter YIELD | Vol drops below **1.5%** | Start deploying capital to Aave |
| Exit YIELD | Vol rises above **6.0%** | Withdraw all capital from Aave |
| Dead zone | **1.5%–6.0%** | Hold current position — no action |

### Graduated Allocation

The amount deployed scales with market confidence:

```
allocation = (1 - volScore / 0.06) x 95%
```

| Volatility | Capital Deployed |
|-----------|-----------------|
| 0.0% | 95% (maximum confidence) |
| 1.0% | 79% |
| 3.0% | 47.5% |
| 5.0% | 16% |
| 6.0%+ | 0% (full withdrawal) |

### Additional Safeguards

- **Minimum trade size**: 5 USDT — prevents micro-transactions that cost more in gas than they earn
- **Auto-compound**: Every 4th cycle, idle USDT in the wallet is re-supplied to Aave
- **P&L tracking**: Total supplied, total withdrawn, cycle count, mode changes — all persisted to disk

---

## Quick Start

### Prerequisites

- Node.js v18+
- An Ethereum Sepolia private key with test ETH for gas
- An Alchemy (or other) Sepolia RPC URL

### Installation

```bash
git clone https://github.com/aliveevie/vol-agent.git
cd vol-agent
npm install
npm run dashboard:install
npm run dashboard:build
cp .env.example .env
```

### Configuration

Edit `.env` with your credentials:

```env
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
USDT_ADDRESS=0x7169D38820dfd117C3FA1f22a697dBA58d90BA06
CHAINLINK_BTC_USD=0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43
X402_PORT=3000
AGENT_INTERVAL_MS=900000
```

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

---

## Dashboard

The React dashboard at `http://localhost:3000` provides full observability:

- **Volatility Chart** — Real-time BTC vol with YIELD/HOLD threshold lines
- **Agent Status** — Current mode, vol score, cycle count, mode changes
- **Wallet & P&L** — USDT balance, total supplied/withdrawn, running since
- **Aave V3 Position** — Collateral, available borrows, health factor
- **Audit Log** — Every decision with timestamp and Etherscan tx links
- **Manual Controls** — Run Cycle, Force Supply, Force Withdraw

### Dashboard Development

```bash
npm start              # Terminal 1: agent + API server
npm run dashboard:dev  # Terminal 2: Vite with hot reload
```

---

## MCP Server

VolAgent exposes **9 MCP tools** for AI clients like Cursor, Claude Code, or any MCP-compatible agent.

```bash
npm run mcp
```

### Connect from Cursor or Claude Code

```json
{
  "mcpServers": {
    "volagent": {
      "command": "node",
      "args": ["/absolute/path/to/vol-agent/src/mcp.js"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_agent_status` | Full agent state, P&L, volatility history, recent logs |
| `get_volatility` | Live BTC/USD vol score from Chainlink oracle |
| `get_wallet_address` | Agent wallet address on Sepolia |
| `get_usdt_balance` | USDT balance |
| `get_aave_position` | Aave V3 position: collateral, debt, health factor |
| `supply_to_aave` | Supply USDT to Aave V3 |
| `withdraw_from_aave` | Withdraw USDT from Aave (supports `"max"`) |
| `get_swap_quote` | Quote a token swap via Velora |
| `execute_swap` | Execute swap with slippage protection |

### Example Prompts

Once connected, ask your AI client naturally:

- *"What's the current BTC volatility?"*
- *"Show me the agent's Aave position"*
- *"Supply 10 USDT to Aave"*
- *"What's the agent wallet balance?"*

---

## x402 Paid Endpoint

VolAgent monetizes its intelligence via the [x402 payment protocol](https://docs.wdk.tether.io/ai/x402):

```
GET /status  →  x402 paywall  →  micro-USDT payment  →  agent snapshot
```

External AI agents can pay on-chain to query VolAgent's state — no API keys, no OAuth, just HTTP + on-chain payment. Built with `@x402/express` + `@x402/evm`.

---

## HTTP API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /` | None | React dashboard |
| `GET /health` | None | Health check |
| `GET /api/status` | None | Agent state + P&L + vol history + logs |
| `GET /api/balance` | None | Wallet USDT balance |
| `GET /api/position` | None | Aave V3 position |
| `POST /api/cycle` | None | Trigger manual cycle |
| `POST /api/supply` | None | Force supply to Aave |
| `POST /api/withdraw` | None | Force withdraw from Aave |
| `GET /status` | x402 | Paid agent snapshot |

---

## Tests

```bash
npm test
```

22 tests covering:
- **Oracle hysteresis** — threshold transitions, dead zone behavior, boundary conditions
- **State management** — P&L tracking, audit log capping, vol history, disk persistence

---

## Project Structure

```
vol-agent/
├── src/
│   ├── agent.js          # Decision loop, graduated allocation, auto-compound
│   ├── oracle.js         # Chainlink vol calculator with phase-aware round IDs
│   ├── wallet.js         # WDK wallet init (PrivateKeySignerEvm)
│   ├── lending.js        # Aave V3 supply/withdraw
│   ├── swap.js           # Velora swap + auto-compound logic
│   ├── mcp.js            # MCP server (9 tools, stdio transport)
│   ├── x402.js           # Express: API + x402 + dashboard serving
│   └── state.js          # State, P&L tracking, disk persistence
├── test/
│   ├── oracle.test.js    # Hysteresis + classification tests (13 tests)
│   └── state.test.js     # State management + P&L tests (9 tests)
├── dashboard/
│   ├── src/
│   │   ├── App.jsx       # Dashboard with vol chart + P&L + controls
│   │   ├── App.css       # Dark theme styles
│   │   ├── api.js        # Fetch helpers
│   │   └── main.jsx      # React entry
│   ├── vite.config.js
│   └── package.json
├── scripts/
│   └── patch-aave-sepolia.js   # Patches WDK Aave module for Sepolia support
├── data/                 # Persisted state (gitignored)
├── .env.example
├── package.json
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Wallet | [`@tetherto/wdk-wallet-evm`](https://docs.wdk.tether.io/sdk/wallet-modules) (PrivateKeySignerEvm) |
| Lending | [`@tetherto/wdk-protocol-lending-aave-evm`](https://docs.wdk.tether.io/sdk/lending-modules) (Aave V3) |
| Swap | [`@tetherto/wdk-protocol-swap-velora-evm`](https://docs.wdk.tether.io/sdk/swap-modules) (Velora DEX) |
| MCP | [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/sdk) (stdio, 9 tools) |
| Payments | [`@x402/express`](https://docs.wdk.tether.io/ai/x402) + `@x402/evm` |
| Oracle | Chainlink BTC/USD (phase-aware round iteration) |
| Dashboard | React 19 + Vite 6 |
| Runtime | Node.js (ESM) |

---

## Network & Contracts

| Contract | Address |
|----------|---------|
| Chain | Ethereum Sepolia (testnet, chain ID `11155111`) |
| USDT | [`0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`](https://sepolia.etherscan.io/address/0x7169D38820dfd117C3FA1f22a697dBA58d90BA06) |
| Chainlink BTC/USD | [`0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`](https://sepolia.etherscan.io/address/0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43) |
| Aave V3 Pool | [`0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951`](https://sepolia.etherscan.io/address/0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951) |

---

## License

MIT

---

<p align="center">
  <strong>Built with IBX Lab for <a href="https://docs.wdk.tether.io">Tether Hackathon Galactica WDK Edition 1</a></strong>
</p>
