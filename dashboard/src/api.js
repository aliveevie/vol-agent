export async function fetchStatus() {
  const res = await fetch('/api/status');
  return res.json();
}

export async function fetchBalance() {
  const res = await fetch('/api/balance');
  return res.json();
}

export async function fetchPosition() {
  const res = await fetch('/api/position');
  return res.json();
}

export async function triggerCycle() {
  const res = await fetch('/api/cycle', { method: 'POST' });
  return res.json();
}

export async function triggerSupply() {
  const res = await fetch('/api/supply', { method: 'POST' });
  return res.json();
}

export async function triggerWithdraw() {
  const res = await fetch('/api/withdraw', { method: 'POST' });
  return res.json();
}
