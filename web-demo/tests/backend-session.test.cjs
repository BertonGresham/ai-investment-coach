const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BackendSession, persistedTrade, backendUrl } = require('../backend-session.js');
const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; };
const session = (id = 'one') => ({ access_token: 'fake-test-token', user: { user_id: id, username: id }, expires_at: new Date(Date.now() + 60000).toISOString() });
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
function logged(fetcher, storage = memory()) {
  const client = new BackendSession('http://127.0.0.1:8080', { fetcher, storage });
  client.session = session(); client.ready = true;
  return client;
}
const sample = () => ({ user_id: 'untrusted', trade_id: 'client-id', stock: { symbol: 'AAPL', market: 'US' },
  trade: { buy_time: '2026-09-11', sell_time: '2026-09-12', buy_price: 100, sell_price: 110, quantity: 10, profit_loss_amount: 99999 }, decision: {} });

test('adapter converts single trade without client identity, invented times, reasons or P&L', () => {
  const input = sample(); const copy = structuredClone(input); const actual = persistedTrade(input);
  assert.deepEqual(input, copy); assert.equal(actual.user_id, undefined); assert.equal(actual.trade_id, undefined);
  assert.equal(actual.trade.profit_loss_amount, undefined); assert.equal(actual.trade.executions.length, 2);
  assert.equal(actual.trade.executions[0].time, '2026-09-11'); assert.equal(actual.trade.executions[1].quantity, 10);
  assert.equal(actual.trade.executions[0].reason, null); assert.equal(actual.trade.execution_order_confirmed, false);
});
test('adapter preserves all partial executions and explicit ordering confirmation', () => {
  const input = sample(); input.trade.executions = [1, 2, 3, 4].map((n) => ({ execution_id: `${n}`, side: n % 2 ? 'buy' : 'sell', time: `2026-09-${10+n}`, price: 100+n, quantity: n, reason: null, filename: 'private.png' }));
  input.trade.execution_order_confirmed = true;
  const output = persistedTrade(input); assert.equal(output.trade.executions.length, 4);
  assert.deepEqual(output.trade.executions.map(x => x.price), [101, 102, 103, 104]);
  assert.ok(output.trade.executions.every(x => !('filename' in x))); assert.equal(output.trade.execution_order_confirmed, true);
});
test('an open position never gains a fabricated sell execution', () => {
  const input = sample(); input.trade.sell_time = null; input.trade.sell_price = null;
  assert.equal(persistedTrade(input).trade.executions.length, 1);
});
test('backend addresses reject credentials, query strings and insecure remote HTTP', () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?token=x', 'https://example.com#x', 'file:///tmp/test']) assert.throws(() => backendUrl(url));
  assert.equal(backendUrl('http://localhost:8080/'), 'http://localhost:8080');
  assert.equal(backendUrl('https://example.com/service/'), 'https://example.com/service');
});
test('restoring a session verifies identity and isolates different backend origins', async () => {
  const storage = memory(); storage.setItem('aiCoachSession:http://127.0.0.1:8080', JSON.stringify(session()));
  const client = new BackendSession('http://127.0.0.1:8080', { storage, fetcher: async (url, options) => {
    assert.ok(url.endsWith('/api/me')); assert.equal(options.headers.Authorization, 'Bearer fake-test-token');
    assert.equal(options.redirect, 'error'); return response(session().user);
  } });
  assert.equal(client.user, null); await client.restore(); assert.equal(client.user.user_id, 'one');
  assert.equal(new BackendSession('http://127.0.0.1:8081', { storage }).session, null);
});
test('failed restoration does not silently activate demo mode or forget a retryable session', async () => {
  const client = logged(async () => { throw new TypeError('offline'); }); client.ready = false;
  await assert.rejects(client.restore(), e => e.status === 0); assert.equal(client.user, null); assert.ok(client.session);
});
test('expired or rejected tokens clear identity and do not return stale data', async () => {
  const client = logged(async () => response({ message: 'expired' }, 401));
  let reset = 0; client.onReset = () => reset++;
  await assert.rejects(client.list(), e => e.status === 401); assert.equal(client.session, null); assert.equal(reset, 1);
});
test('late successful responses from an old account cannot render in the new session', async () => {
  let finish; const client = logged(() => new Promise(resolve => { finish = resolve; }));
  const pending = client.list(); client.clear(); client.session = session('two'); client.ready = true;
  finish(response([{ trade_id: 'private-old-record' }]));
  await assert.rejects(pending, e => e.stale); assert.equal(client.user.user_id, 'two');
});
test('late network errors cannot clear or replace a newer session', async () => {
  let reject; const client = logged(() => new Promise((_, fail) => { reject = fail; }));
  const pending = client.list(); client.clear(); client.session = session('two'); client.ready = true;
  reject(new TypeError('offline')); await assert.rejects(pending, e => e.stale); assert.equal(client.user.user_id, 'two');
});
test('submission retry after an ambiguous network failure reuses the key, including after refresh', async () => {
  const storage = memory(); const keys = []; let fail = true;
  const fetcher = async (url, options) => {
    if (url.endsWith('/api/trades')) { keys.push(options.headers['Idempotency-Key']); if (fail) { fail = false; throw Error('lost response'); } return response({ trade_id: 'saved' }, 201); }
    return response({ trade_id: 'saved', analysis_mode: 'mock', result: {} });
  };
  const payload = persistedTrade(sample());
  await assert.rejects(logged(fetcher, storage).submit(payload));
  const result = await logged(fetcher, storage).submit(payload);
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.equal(result.trade.trade_id, 'saved');
});
test('edited data gets a new submission key and failed analysis retains the saved trade', async () => {
  const keys = []; const client = logged(async (url, options) => {
    if (url.endsWith('/api/trades')) { keys.push(options.headers['Idempotency-Key']); return response({ trade_id: 'saved' }, 201); }
    return response({ message: 'upstream down' }, 502);
  });
  const payload = persistedTrade(sample());
  await assert.rejects(client.submit(payload), e => e.savedTrade.trade_id === 'saved');
  payload.stock.symbol = 'MSFT'; await assert.rejects(client.submit(payload), e => e.status === 502);
  assert.notEqual(keys[0], keys[1]);
});
test('login never sends previous Bearer credentials and logout always clears local state', async () => {
  const client = logged(async (url, options) => {
    if (url.endsWith('/login')) { assert.equal(options.headers.Authorization, undefined); return response(session('two')); }
    throw Error('offline');
  });
  await client.authenticate(false, { email: 'synthetic@example.com', password: 'synthetic-only' });
  assert.equal(client.user.user_id, 'two'); await assert.rejects(client.logout()); assert.equal(client.user, null);
});
test('profile history paginates, deduplicates and retains original report provenance', async () => {
  let calls = 0; const client = logged(async url => {
    calls++;
    if (url.includes('offset=0')) return response(Array.from({ length: 100 }, (_, i) => ({ trade_id: `t${i}`, analysis_mode: 'mock' })));
    return response([{ trade_id: 't99', analysis_mode: 'mock' }, { trade_id: 't100', analysis_mode: 'llm' }]);
  });
  const reports = await client.profileReports(); assert.equal(calls, 2); assert.equal(reports.length, 101); assert.equal(reports.at(-1).analysis_mode, 'llm');
});
