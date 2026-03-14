# VolAgent

Volatility-driven autonomous treasury agent built with Tether WDK. Reads on-chain BTC volatility via Chainlink, makes graduated capital allocation decisions with hysteresis, executes via Aave V3 and Velora, auto-compounds idle capital, and tracks P&L — all without human intervention.

```
Read Volatility → Compute Allocation → Execute via WDK → Auto-Compound → Log → Sleep → Repeat
```

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

## Decision Engine

The agent uses a **graduated allocation model with hysteresis** — not a simple if/else toggle:

**Hysteresis bands** prevent threshold oscillation (the #1 gas-wasting bug in DeFi bots):
- Enter YIELD mode: vol drops below **1.5%**
- Exit YIELD mode: vol rises above **6%**
- This creates a dead zone (1.5%–6%) where the agent holds its current position

**Graduated allocation** — the amount deployed scales with confidence:
```
allocation = (1 - volScore / 0.06) × 95%
```
At 0% vol → 95% deployed. At 3% vol → 47.5% deployed. At 6%+ → 0%.

**Minimum trade size** (5 USDT) prevents gas-wasting micro-transactions.

**Auto-compound** every 4th cycle: idle USDT in wallet is re-supplied to Aave.

**P&L tracking**: total supplied, total withdrawn, cycle count, mode changes — all persisted to disk.

## Prerequisites

- Node.js v18+
- An Ethereum Sepolia private key with test ETH for gas
- An Alchemy (or other) Sepolia RPC URL

## Setup

```bash
git clone <repo-url>
cd vol-agent
npm install
npm run dashboard:install
npm run dashboard:build
cp .env.example .env
```

Edit `.env`:

```
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
USDT_ADDRESS=0x7169D38820dfd117C3FA1f22a697dBA58d90BA06
CHAINLINK_BTC_USD=0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43
X402_PORT=3000
AGENT_INTERVAL_MS=900000
```

## Run

### Agent + Dashboard

```bash
npm start
```

Open http://localhost:3000. The dashboard shows:
- **Volatility chart** with YIELD/HOLD threshold lines
- **Agent status** — mode, vol score, cycles, mode changes
- **Wallet & P&L** — balance, total supplied/withdrawn, running since
- **Aave V3 position** — collateral, debt, health factor
- **Audit log** — every action with tx links to Etherscan
- **Manual controls** — Run Cycle, Force Supply, Force Withdraw

### Dashboard Development

```bash
npm start          # Terminal 1: agent
npm run dashboard:dev  # Terminal 2: Vite with hot reload
```

### MCP Server

```bash
npm run mcp
```

Connect from any MCP client:

```json
{
  "mcpServers": {
    "volagent": {
      "command": "node",
      "args": ["src/mcp.js"],
      "cwd": "/path/to/vol-agent"
    }
  }
}
```

9 MCP tools available:

| Tool | Description |
|------|-------------|
| `get_agent_status` | Full agent state, P&L, volatility history, recent logs |
| `get_volatility` | Live BTC/USD vol score from Chainlink oracle |
| `get_wallet_address` | Agent wallet address |
| `get_usdt_balance` | USDT balance |
| `get_aave_position` | Aave V3 position data |
| `supply_to_aave` | Supply USDT to Aave |
| `withdraw_from_aave` | Withdraw USDT from Aave |
| `get_swap_quote` | Quote a Velora swap |
| `execute_swap` | Swap with slippage protection |

### Tests

```bash
npm test
```

22 tests covering oracle hysteresis logic and state management.

## HTTP Endpoints

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

## Project Structure

```
vol-agent/
├── src/
│   ├── agent.js       # Decision loop, graduated allocation, auto-compound
│   ├── oracle.js      # Chainlink vol calculator with phase-aware round IDs
│   ├── wallet.js      # WDK wallet init (PrivateKeySignerEvm)
│   ├── lending.js     # Aave V3 supply/withdraw
│   ├── swap.js        # Velora swap + auto-compound logic
│   ├── mcp.js         # MCP server (9 tools, shared state)
│   ├── x402.js        # Express: API + x402 + dashboard serving
│   └── state.js       # State, P&L tracking, disk persistence
├── test/
│   ├── oracle.test.js # Hysteresis + classification tests
│   └── state.test.js  # State management + P&L tests
├── dashboard/
│   ├── src/
│   │   ├── App.jsx    # Dashboard with vol chart + P&L
│   │   ├── App.css    # Dark theme styles
│   │   ├── api.js     # Fetch helpers
│   │   └── main.jsx   # React entry
│   ├── vite.config.js
│   └── package.json
├── scripts/
│   └── patch-aave-sepolia.js  # Adds Sepolia to WDK Aave module
├── data/              # Persisted state (gitignored)
├── .env.example
├── CLAUDE.md
├── package.json
└── README.md
```

## Tech Stack

| Layer | Package |
|-------|---------|
| Wallet | `@tetherto/wdk-wallet-evm` (PrivateKeySignerEvm) |
| Lending | `@tetherto/wdk-protocol-lending-aave-evm` |
| Swap | `@tetherto/wdk-protocol-swap-velora-evm` |
| MCP | `@modelcontextprotocol/sdk` |
| Payments | `@x402/express` + `@x402/evm` |
| Dashboard | React 19 + Vite 6 |
| Oracle | Chainlink BTC/USD (phase-aware round iteration) |
| Runtime | Node.js (ESM) |

## Network

- **Chain:** Ethereum Sepolia (testnet, chain ID 11155111)
- **USDT:** `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`
- **Chainlink BTC/USD:** `0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`
- **Aave V3 Pool:** `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951`

---

*Built with IBX Lab for Tether Hackathon Galactica WDK Edition 1*
