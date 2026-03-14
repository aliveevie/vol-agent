import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { getSnapshot, logAction } from './state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const jsonBigInt = (data) =>
  JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

let actionInProgress = false;

export function createStatusApp(ctx) {
  const { address, runCycle, getBalance, getPosition, supplyToAave, withdrawFromAave } = ctx;
  const app = express();

  app.use(express.json());

  // CORS for Vite dev server
  app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // --- Free API routes for dashboard ---

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/status', (_req, res) => {
    res.json({ ...getSnapshot(), address });
  });

  app.get('/api/balance', async (_req, res) => {
    try {
      const balance = await getBalance();
      res.json({ address, balance: balance.toString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/position', async (_req, res) => {
    try {
      const position = await getPosition();
      res.json(jsonBigInt(position));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cycle', async (_req, res) => {
    if (actionInProgress) return res.status(409).json({ error: 'Action already in progress' });
    actionInProgress = true;
    try {
      await runCycle();
      res.json({ ok: true, snapshot: { ...getSnapshot(), address } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      actionInProgress = false;
    }
  });

  app.post('/api/supply', async (_req, res) => {
    if (actionInProgress) return res.status(409).json({ error: 'Action already in progress' });
    actionInProgress = true;
    try {
      const balance = await getBalance();
      const supplyAmount = (balance * 90n) / 100n;
      if (supplyAmount <= 0n) {
        return res.status(400).json({ error: 'No USDT balance to supply' });
      }
      const tx = await supplyToAave(supplyAmount);
      logAction({ action: `MANUAL SUPPLY ${supplyAmount} USDT`, txHash: tx?.hash || String(tx) });
      res.json({ ok: true, txHash: tx?.hash || String(tx), amount: supplyAmount.toString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      actionInProgress = false;
    }
  });

  app.post('/api/withdraw', async (_req, res) => {
    if (actionInProgress) return res.status(409).json({ error: 'Action already in progress' });
    actionInProgress = true;
    try {
      const tx = await withdrawFromAave(0n);
      logAction({ action: 'MANUAL WITHDRAW all from Aave', txHash: tx?.hash || String(tx) });
      res.json({ ok: true, txHash: tx?.hash || String(tx) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      actionInProgress = false;
    }
  });

  // --- x402 paid status endpoint ---

  const facilitator = new HTTPFacilitatorClient();
  const resourceServer = new x402ResourceServer(facilitator)
    .register('eip155:84532', new ExactEvmScheme());

  app.use(
    paymentMiddleware(
      {
        'GET /status': {
          accepts: {
            scheme: 'exact',
            network: 'eip155:84532',
            price: '$0.001',
            payTo: address,
          },
          description: 'VolAgent live status snapshot',
        },
      },
      resourceServer,
      undefined,
      undefined,
      false
    )
  );

  app.get('/status', (_req, res) => {
    res.json(getSnapshot());
  });

  // --- Serve React dashboard (production build) ---
  app.use(express.static(join(__dirname, '..', 'dashboard', 'dist')));
  app.get('*', (_req, res, next) => {
    // Only serve index.html for non-API, non-status routes
    if (_req.path.startsWith('/api') || _req.path === '/status' || _req.path === '/health') {
      return next();
    }
    res.sendFile(join(__dirname, '..', 'dashboard', 'dist', 'index.html'), (err) => {
      if (err) next();
    });
  });

  return app;
}
