import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStatus, fetchBalance, fetchPosition, triggerCycle, triggerSupply, triggerWithdraw } from './api.js';

function formatUsdt(raw) {
  if (!raw || raw === '0') return '0.00';
  const str = String(raw).padStart(7, '0');
  const whole = str.slice(0, -6) || '0';
  const dec = str.slice(-6).slice(0, 2);
  return `${Number(whole).toLocaleString()}.${dec}`;
}

function shortenAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function VolChart({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || data.length < 2) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const dw = w / 2;
    const dh = h / 2;

    ctx.clearRect(0, 0, dw, dh);

    const values = data.map(d => d.v);
    const max = Math.max(...values, 0.07);
    const min = Math.min(...values, 0);
    const range = max - min || 0.01;
    const pad = 8;

    // Background grid
    ctx.strokeStyle = '#1e2530';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad + ((dh - pad * 2) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(dw - pad, y);
      ctx.stroke();
    }

    // Threshold lines
    const yieldY = pad + (dh - pad * 2) * (1 - (0.015 - min) / range);
    const holdY = pad + (dh - pad * 2) * (1 - (0.06 - min) / range);

    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, yieldY);
    ctx.lineTo(dw - pad, yieldY);
    ctx.stroke();

    ctx.strokeStyle = '#991b1b';
    ctx.beginPath();
    ctx.moveTo(pad, holdY);
    ctx.lineTo(dw - pad, holdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vol line
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = pad + ((dw - pad * 2) * i) / (values.length - 1);
      const y = pad + (dh - pad * 2) * (1 - (values[i] - min) / range);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under line
    const lastX = pad + (dw - pad * 2);
    const lastY = pad + (dh - pad * 2) * (1 - (values[values.length - 1] - min) / range);
    ctx.lineTo(lastX, dh - pad);
    ctx.lineTo(pad, dh - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(96, 165, 250, 0.08)';
    ctx.fill();
  }, [data]);

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} style={{ width: '100%', height: '120px' }} />
      <div className="chart-labels">
        <span className="chart-label green">1.5% YIELD</span>
        <span className="chart-label red">6% HOLD</span>
      </div>
    </div>
  );
}

function PositionCard({ position }) {
  if (!position) return <p className="loading-text">Loading...</p>;
  if (position.error) return <p className="error-text">{position.error}</p>;

  const collateral = position.totalCollateralBase || '0';
  const debt = position.totalDebtBase || '0';
  const available = position.availableBorrowsBase || '0';
  const hf = position.healthFactor;
  const hfDisplay = hf && BigInt(hf) > 10n ** 30n ? 'Safe' : hf;

  return (
    <div className="status-grid">
      <div className="stat">
        <span className="stat-label">Collateral</span>
        <span className="stat-value mono">{formatUsdt(collateral)} USD</span>
      </div>
      <div className="stat">
        <span className="stat-label">Debt</span>
        <span className="stat-value mono">{formatUsdt(debt)} USD</span>
      </div>
      <div className="stat">
        <span className="stat-label">Borrow Power</span>
        <span className="stat-value mono">{formatUsdt(available)} USD</span>
      </div>
      <div className="stat">
        <span className="stat-label">Health Factor</span>
        <span className={`badge ${hfDisplay === 'Safe' ? 'badge-green' : 'badge-yellow'}`}>{hfDisplay}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [balance, setBalance] = useState(null);
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [s, b, p] = await Promise.allSettled([fetchStatus(), fetchBalance(), fetchPosition()]);
      if (s.status === 'fulfilled') setStatus(s.value);
      if (b.status === 'fulfilled') setBalance(b.value);
      if (p.status === 'fulfilled') setPosition(p.value);
    } catch {}
  }, []);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 10_000);
    return () => clearInterval(id);
  }, [loadAll]);

  const handleAction = async (name, fn) => {
    setLoading(name);
    setError('');
    try {
      const result = await fn();
      if (result.error) setError(result.error);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const volPct = status ? (status.volScore * 100).toFixed(2) : '0.00';
  const modeColor = status?.mode === 'YIELD' ? 'badge-green' : 'badge-orange';

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>VolAgent</h1>
            <span className="subtitle">Autonomous Volatility-Driven Treasury</span>
          </div>
          {status && (
            <div className="header-status">
              <span className={`badge badge-lg ${modeColor}`}>{status.mode}</span>
            </div>
          )}
        </div>
      </header>

      {/* Volatility Chart */}
      <div className="card">
        <div className="card-header-row">
          <h2>Volatility (24h BTC/USD)</h2>
          <span className="mono vol-score">{volPct}%</span>
        </div>
        <VolChart data={status?.volHistory || []} />
      </div>

      <div className="grid">
        {/* Status Card */}
        <div className="card">
          <h2>Agent Status</h2>
          {status ? (
            <div className="status-grid">
              <div className="stat">
                <span className="stat-label">Mode</span>
                <span className={`badge ${modeColor}`}>{status.mode}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Vol Score</span>
                <span className="stat-value mono">{volPct}%</span>
              </div>
              <div className="stat">
                <span className="stat-label">Last Check</span>
                <span className="stat-value">{timeAgo(status.lastCheck)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Last Action</span>
                <span className="stat-value">{status.lastAction || 'none'}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Cycles Run</span>
                <span className="stat-value mono">{status.pnl?.cycleCount || 0}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Mode Changes</span>
                <span className="stat-value mono">{status.pnl?.modeChanges || 0}</span>
              </div>
            </div>
          ) : (
            <p className="loading-text">Connecting...</p>
          )}
        </div>

        {/* Wallet + P&L Card */}
        <div className="card">
          <h2>Wallet & P&L</h2>
          {balance ? (
            <div className="status-grid">
              <div className="stat">
                <span className="stat-label">Address</span>
                <span className="stat-value mono" title={balance.address}>
                  {shortenAddr(balance.address)}
                  <button className="copy-btn" onClick={() => navigator.clipboard.writeText(balance.address)}>copy</button>
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">USDT Balance</span>
                <span className="stat-value mono large">{formatUsdt(balance.balance)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Total Supplied</span>
                <span className="stat-value mono">{formatUsdt(status?.pnl?.totalSupplied)} USDT</span>
              </div>
              <div className="stat">
                <span className="stat-label">Total Withdrawn</span>
                <span className="stat-value mono">{formatUsdt(status?.pnl?.totalWithdrawn)} USDT</span>
              </div>
              <div className="stat">
                <span className="stat-label">Running Since</span>
                <span className="stat-value">{status?.pnl?.startedAt ? new Date(status.pnl.startedAt).toLocaleDateString() : 'not started'}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Network</span>
                <span className="stat-value">Sepolia</span>
              </div>
            </div>
          ) : (
            <p className="loading-text">Loading...</p>
          )}
        </div>

        {/* Aave Position Card */}
        <div className="card">
          <h2>Aave V3 Position</h2>
          <PositionCard position={position} />
        </div>

        {/* Actions Card */}
        <div className="card">
          <h2>Manual Controls</h2>
          <p className="hint">Override the autonomous agent when needed.</p>
          <div className="actions">
            <button className="btn btn-blue" disabled={!!loading} onClick={() => handleAction('cycle', triggerCycle)}>
              {loading === 'cycle' ? 'Running...' : 'Run Cycle'}
            </button>
            <button className="btn btn-green" disabled={!!loading} onClick={() => handleAction('supply', triggerSupply)}>
              {loading === 'supply' ? 'Supplying...' : 'Force Supply'}
            </button>
            <button className="btn btn-red" disabled={!!loading} onClick={() => handleAction('withdraw', triggerWithdraw)}>
              {loading === 'withdraw' ? 'Withdrawing...' : 'Force Withdraw'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>

      {/* Audit Log */}
      <div className="card log-card">
        <h2>Audit Log</h2>
        <div className="log-scroll">
          {status?.recentLogs?.length > 0 ? (
            [...status.recentLogs].reverse().map((entry, i) => (
              <div className="log-entry" key={i}>
                <span className="log-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className={`log-mode badge-sm ${entry.mode === 'YIELD' ? 'badge-green' : 'badge-orange'}`}>
                  {entry.mode}
                </span>
                <span className="log-vol mono">{(entry.volScore * 100).toFixed(2)}%</span>
                <span className="log-action">{entry.action}</span>
                {entry.txHash && entry.txHash !== 'undefined' && (
                  <a className="log-tx" href={`https://sepolia.etherscan.io/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer">
                    tx
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="loading-text">No logs yet — waiting for first cycle</p>
          )}
        </div>
      </div>

      <footer className="footer">
        Auto-refreshes every 10s &middot; Agent cycles every 15m &middot; Hysteresis: YIELD &lt;1.5% | HOLD &gt;6% &middot; Sepolia
      </footer>
    </div>
  );
}
