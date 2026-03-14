# VolAgent — Project Conventions

- ESM only (`"type": "module"` in package.json). Use `import`/`export`, never `require`.
- Secrets loaded from `.env` via `dotenv`. Never hardcode keys.
- Always use private key (`PRIVATE_KEY`), never seed phrases.
- All token amounts as `BigInt`. USDT has 6 decimals (1 USDT = `1_000_000n`).
- Ethereum Sepolia testnet. USDT address: `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`.
- Chainlink BTC/USD feed (Sepolia): `0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`.
- Aave V3 on Sepolia (patched via `scripts/patch-aave-sepolia.js`).
- Agent loop runs every 15 minutes by default (`AGENT_INTERVAL_MS`).
- Hysteresis thresholds: enter YIELD below 1.5% vol, exit YIELD above 6% vol.
- Minimum trade size: 5 USDT to avoid wasting gas.
- Graduated allocation: `(1 - volScore/0.06) * 95%` of balance deployed.
- Auto-compound idle USDT back to Aave every 4th cycle.
- State persisted to `data/state.json` on every action.
- The agent must never crash — all cycle errors are caught and logged.
- Run tests with `npm test` (Node.js built-in test runner).
