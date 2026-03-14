# VolAgent — Slide Content

---

## Slide 1: Title

**VolAgent**
Volatility-Driven Autonomous Treasury Agent

Built with Tether WDK | Ethereum Sepolia
IBX Lab — Tether Hackathon Galactica WDK Edition 1

---

## Slide 2: The Problem

**DeFi treasuries bleed money from inaction and bad automation.**

- Idle USDT in a wallet earns 0% — capital sits dead while Aave offers 3-8% APY
- Human managers can't watch markets 24/7 — they react late, miss windows, sleep
- Simple threshold bots are worse: they flip-flop at boundaries, burning gas on pointless transactions
- Example: a bot with a 2% vol threshold deposits at 1.9%, withdraws at 2.1%, deposits at 1.8%, withdraws at 2.0% — 4 transactions, $8 in gas, $0 earned
- Existing yield aggregators require handing over your keys — custodial risk
- No standard way for AI agents to interact with DeFi bots — they're black boxes

---

## Slide 3: The Solution

**VolAgent: a fully autonomous, self-custodial treasury agent that thinks before it acts.**

- Reads real-time BTC volatility from Chainlink oracle on-chain
- Uses hysteresis (two thresholds, not one) to eliminate oscillation — the #1 gas-wasting bug in DeFi bots
- Deploys capital gradually based on confidence, not all-or-nothing
- Executes entirely through Tether WDK modules: wallet, Aave V3 lending, Velora swap
- Self-custodial — private key never leaves your machine
- Auto-compounds idle capital every 4th cycle
- Tracks full P&L: total supplied, withdrawn, cycles, mode changes
- Exposes 9 MCP tools so any AI client (Cursor, Claude Code) can query and control the agent
- Monetizes its intelligence via x402 paid status endpoint
- Live React dashboard for full observability
- 22 unit tests, crash-proof design, state persisted to disk

---

## Slide 4: How It Works — The Core Loop

Every 15 minutes, VolAgent runs this cycle:

1. **Read** — Fetch BTC/USD price history from Chainlink oracle (phase-aware round IDs, 24h window)
2. **Compute** — Calculate volatility score: `(high - low) / current price`
3. **Decide** — Apply hysteresis + graduated allocation to determine how much capital to deploy
4. **Execute** — Supply to or withdraw from Aave V3 via WDK lending module
5. **Compound** — Every 4th cycle, re-deploy any idle USDT sitting in the wallet
6. **Log** — Record action to audit log, update P&L, persist state to disk
7. **Sleep** — Wait 15 minutes, repeat

No human triggers. No manual intervention. Fully autonomous.

---

## Slide 5: Hysteresis — Why Two Thresholds Beat One

The problem with a single threshold (e.g., 2%):
- Vol at 1.9% → deposit → Vol at 2.1% → withdraw → Vol at 1.9% → deposit → endless loop

VolAgent uses two thresholds with a dead zone:
- Enter YIELD mode: volatility drops below **1.5%**
- Exit YIELD mode: volatility rises above **6.0%**
- Between 1.5% and 6.0%: **agent holds its current position — no action**

This dead zone eliminates oscillation entirely. Zero wasted gas. Zero unnecessary transactions.

---

## Slide 6: Graduated Allocation — Confidence-Scaled Deployment

Not binary. The agent scales deployment with its confidence level.

Formula: `allocation = (1 - volScore / 0.06) x 95%`

- Vol at 0.0% → 95% of balance deployed (maximum confidence)
- Vol at 1.0% → 79% deployed
- Vol at 3.0% → 47.5% deployed (half confidence)
- Vol at 5.0% → 16% deployed (cautious)
- Vol at 6.0%+ → 0% deployed (full withdrawal)

Additional safeguard: minimum trade size of 5 USDT prevents micro-transactions that cost more in gas than they earn.

---

## Slide 7: WDK Integration — Full Stack

Every execution flows through Tether WDK modules:

**Wallet** — `@tetherto/wdk-wallet-evm`
- Self-custodial using `PrivateKeySignerEvm`
- Private key loaded from environment, never exposed

**Lending** — `@tetherto/wdk-protocol-lending-aave-evm`
- Aave V3 on Sepolia (patched via postinstall script to add Sepolia support)
- Supply USDT for yield, withdraw when volatility spikes
- Read position data: collateral, debt, health factor

**Swap** — `@tetherto/wdk-protocol-swap-velora-evm`
- Velora DEX integration with slippage protection (0.5% max)
- Used for token swaps and auto-compound flows

All three WDK modules working together in one autonomous agent.

---

## Slide 8: MCP Server — AI Interoperability

9 MCP tools accessible from any MCP-compatible client (Cursor, Claude Code, custom agents):

- `get_agent_status` — Full agent state, P&L, volatility history, recent audit logs
- `get_volatility` — Live BTC/USD volatility score from Chainlink
- `get_wallet_address` — Agent wallet address on Sepolia
- `get_usdt_balance` — Current USDT balance
- `get_aave_position` — Aave V3 position: collateral, debt, health factor
- `supply_to_aave` — Deploy USDT to Aave V3
- `withdraw_from_aave` — Pull USDT from Aave (supports "max" for full withdrawal)
- `get_swap_quote` — Quote a token swap via Velora
- `execute_swap` — Execute swap with slippage protection

An AI agent can connect to VolAgent and ask: "What's the current volatility?" or "Supply 10 USDT to Aave" — and the agent executes it.

---

## Slide 9: x402 — Agent Pays Agent

VolAgent exposes a paid HTTP endpoint using the x402 payment protocol:

- `GET /status` requires a micro-payment (0.10 USDT) to access
- External AI agents pay on-chain to query VolAgent's state — no API keys, no OAuth
- Built with `@x402/express` + `@x402/evm`
- The agent earns revenue while it manages capital

This demonstrates agent-to-agent commerce: one autonomous agent paying another for intelligence.

---

## Slide 10: React Dashboard — Full Observability

Live web UI at `http://localhost:3000` showing:

- **Volatility chart** — Real-time BTC vol with YIELD/HOLD threshold lines drawn on canvas
- **Agent status** — Current mode (HOLD/YIELD), vol score, cycle count, mode changes
- **Wallet & P&L** — USDT balance, total supplied, total withdrawn, running since timestamp
- **Aave V3 position** — Collateral deposited, available borrows, health factor
- **Audit log** — Every decision with timestamp, action description, and Etherscan tx links
- **Manual controls** — Buttons to Run Cycle, Force Supply, Force Withdraw

Dark theme. Auto-refreshing. No black boxes — everything the agent does is visible.

---

## Slide 11: Safety & Reliability

VolAgent is built to never crash and never lose money unnecessarily:

- **Crash-proof loops** — Every cycle wrapped in try/catch, errors logged, next cycle runs
- **Hysteresis** — No flip-flop oscillation between modes
- **Minimum trade size** — 5 USDT floor prevents dust transactions
- **Slippage protection** — 0.5% max on all Velora swaps
- **Concurrency guard** — One operation at a time, no race conditions
- **Disk persistence** — State saved to `data/state.json` on every action, survives restarts
- **Self-custodial** — Private key stays on your machine, WDK handles signing
- **22 unit tests** — Oracle hysteresis logic and state management fully covered

---

## Slide 12: Architecture Diagram

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

## Slide 13: Tech Stack

- **Wallet**: `@tetherto/wdk-wallet-evm` (PrivateKeySignerEvm)
- **Lending**: `@tetherto/wdk-protocol-lending-aave-evm` (Aave V3 Sepolia)
- **Swap**: `@tetherto/wdk-protocol-swap-velora-evm` (Velora DEX)
- **MCP**: `@modelcontextprotocol/sdk` (stdio transport, 9 tools)
- **Payments**: `@x402/express` + `@x402/evm` (paid status endpoint)
- **Oracle**: Chainlink BTC/USD with phase-aware round iteration
- **Dashboard**: React 19 + Vite 6
- **Runtime**: Node.js (ESM)
- **Network**: Ethereum Sepolia (testnet, chain ID 11155111)
- **Tests**: Node.js built-in test runner (22 tests passing)

---

## Slide 14: Hackathon Track Coverage

**Best Projects Overall ($6,000 1st place)**
- Full WDK integration: wallet + lending + swap + MCP + x402
- Professional codebase: 22 tests, disk persistence, React dashboard, crash-proof design

**Lending Bot Track ($3,000 1st place)**
- Aave V3 supply/withdraw with hysteresis to prevent gas waste
- Graduated allocation scales deployment with market confidence
- Auto-compound every 4th cycle maximizes capital efficiency
- Full P&L tracking: supplied, withdrawn, cycles, mode changes

**Autonomous DeFi Agent Track ($3,000 1st place)**
- Zero human intervention between cycles — fully autonomous 15-minute decision loops
- Self-custodial WDK wallet, state persists across restarts
- MCP server enables AI-to-agent communication
- x402 enables agent-to-agent commerce

---

## Slide 15: What Makes VolAgent Different

- **Not a toy** — graduated allocation formula, hysteresis dead zone, auto-compound, P&L tracking, minimum trade sizes
- **Not a black box** — React dashboard, full audit log with tx hashes, MCP interface for AI clients
- **Not custodial** — self-custodial WDK wallet, private key never leaves the machine
- **Not fragile** — 22 unit tests, crash-proof error handling, state persisted to disk
- **Not isolated** — MCP server lets any AI client operate the agent, x402 lets agents pay for intelligence
- **Not manual** — fully autonomous 15-minute decision cycles, zero human triggers required

---

## Slide 16: Live Demo

```bash
# Start the agent + dashboard
npm start

# Open dashboard
http://localhost:3000

# Connect MCP from Cursor or Claude Code
"What's the current volatility?"
"Show me the Aave position"
"Supply 10 USDT to Aave"

# Run the test suite
npm test   →   22 tests, all passing
```

---

## Slide 17: Thank You

**VolAgent**
Autonomous treasury management, powered by Tether WDK

Built with IBX Lab
Tether Hackathon Galactica WDK Edition 1

GitHub: vol-agent
Dashboard: http://localhost:3000
MCP: `node src/mcp.js`
