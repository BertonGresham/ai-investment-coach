const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { BackendSession, persistedTrade } = require('../web-demo/backend-session.js');
const base = 'http://127.0.0.1:8085';
const stateFile = process.env.INTEGRATION_TEST_STATE || path.join(require('node:os').tmpdir(), 'ai-coach-synthetic-integration-state.json');
const memory = () => { const data = new Map(); return {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key),
}; };
const client = storage => new BackendSession(base, { storage: storage || memory() });
const payload = () => persistedTrade({
  stock: { symbol: 'AAPL', market: 'US' },
  trade: { execution_order_confirmed: true, executions: [
    ['buy', '2026-09-11T10:00:00-04:00', 100, 10],
    ['sell', '2026-09-14T10:00:00-04:00', 120, 5],
    ['buy', '2026-09-15T10:00:00-04:00', 80, 10],
    ['sell', '2026-09-16T10:00:00-04:00', 110, 10],
  ].map(([side, time, price, quantity], index) => ({
    execution_id: `synthetic-${index + 1}`, side, time, price, quantity,
    reason: 'Synthetic integration fixture, not a real investment decision.',
  })) },
  decision: {}, analysis_context: { language: 'zh-CN' },
});
function checkSummary(report) {
  assert.equal(report.analysis_mode, 'mock');
  const summary = report.result.execution_summary;
  assert.equal(summary.timeline.length, 4);
  assert.equal(summary.remaining_quantity, 5);
  assert.equal(summary.average_buy_price, 90);
  assert.ok(Math.abs(summary.average_sell_price - 113.3333333333) < 0.001);
  assert.ok(Math.abs(summary.realized_profit_loss - 333.3333333333) < 0.001);
}
async function main() {
  const health = await fetch('http://127.0.0.1:8006/health', { signal: AbortSignal.timeout(5000) });
  assert.equal((await health.json()).analysis_mode, 'mock', 'Live tests require Mock AI');
  if (process.argv.includes('--verify-only')) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const a = client();
    await a.authenticate(false, { email: state.email, password: state.password });
    const rows = await a.list();
    assert.equal(rows.filter(row => row.trade_id === state.tradeId).length, 1);
    checkSummary(await a.report(state.tradeId));
    await a.logout();
    console.log('PASS: re-login finds the same persisted trade and full report after backend restart.');
    return;
  }
  const id = randomUUID();
  const password = `Synthetic-${randomUUID()}`;
  const email = `synthetic-${id}@example.invalid`;
  const storage = memory();
  const a = client(storage);
  const b = client();
  try {
    await a.authenticate(true, { username: 'Synthetic QA A', email, password });
    await b.authenticate(true, { username: 'Synthetic QA B', email: `other-${id}@example.invalid`, password });
    console.log('PASS: two test accounts registered.');
    const data = payload();
    const saved = await a.submit(data);
    checkSummary(saved.report);
    assert.equal(saved.trade.request.trade.executions.length, 4);
    console.log('PASS: browser adapter -> Spring Boot -> MySQL -> Mock AI, four-leg accounting correct.');
    const restored = client(storage);
    await restored.restore();
    const repeated = await restored.submit(data);
    assert.equal(repeated.trade.trade_id, saved.trade.trade_id);
    const rows = await restored.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].analysis_status, 'COMPLETED');
    assert.equal((await restored.profileReports()).length, 1);
    console.log('PASS: restored client verifies identity; repeated submission creates no duplicate trade/report.');
    await assert.rejects(b.detail(saved.trade.trade_id), error => error.status === 404);
    await assert.rejects(b.report(saved.trade.trade_id), error => error.status === 404);
    assert.deepEqual(await b.list(), []);
    console.log('PASS: another account cannot list or read the first account\'s trade/report.');
    fs.writeFileSync(stateFile, JSON.stringify({ email, password, tradeId: saved.trade.trade_id }), { mode: 0o600 });
    await a.logout();
    await assert.rejects(restored.list(), error => error.status === 401);
    assert.equal(restored.user, null);
    await restored.authenticate(false, { email, password });
    checkSummary(await restored.report(saved.trade.trade_id));
    await restored.logout();
    console.log('PASS: logout revokes the server token; re-login restores persisted history.');
  } finally {
    await a.logout().catch(() => {});
    await b.logout().catch(() => {});
  }
}
main().catch(async error => {
  console.error('FAIL:', error.message, error.status || '');
  if (error.status === 422 && error.savedTrade) {
    const response = await fetch('http://127.0.0.1:8006/analyze-trade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error.savedTrade.request), signal: AbortSignal.timeout(5000),
    });
    const detail = await response.json();
    console.error('AI validation:', JSON.stringify(detail.detail?.map(({ loc, msg }) => ({ loc, msg }))));
  }
  process.exitCode = 1;
});
