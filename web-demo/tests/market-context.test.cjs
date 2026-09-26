const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../market-context.js'), 'utf8');

function fixture(fetch) {
  const nodes = new Map();
  function node() {
    return {
      value: '', checked: false, hidden: true, textContent: '', dataset: {}, children: [], options: [{}, {}], listeners: {},
      append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      addEventListener(event, callback) { this.listeners[event] = callback; },
    };
  }
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  get('autoMarket').checked = true;
  get('market').value = 'US';
  get('marketSource').value = 'demo';
  get('symbol').value = 'AAPL';
  get('buyTime').value = '2025-07-25T10:30';
  get('buyReasonType').value = 'fear_of_missing_out';
  let language = 'zh-CN';
  const create = vm.runInNewContext(script + '\ncreateMarketContext', {
    document: { getElementById: get, querySelector: get, createElement: node },
    fetch, AbortController, setTimeout, clearTimeout, Intl, Date,
  });
  return { get, ui: create({ getLanguage: () => language, getApiBase: () => 'http://test' }), setLanguage(value) { language = value; } };
}

function response() {
  return { ok: true, json: async () => ({
    source: 'demo', provider: 'synthetic', symbol: 'AAPL', bar_count: 30,
    data_start: '2025-06-01', data_end: '2025-07-24', exchange_timezone: 'America/New_York',
    kline_summary: '[DEMO] synthetic data', metrics: { last_close: 100, daily_change_pct: null, five_session_change_pct: null, sma20: 100, volume_vs_previous20: 1 },
    book_notes: [], rag_context: [{ source: 'reviewed source', title: 'note', content: 'paraphrase' }],
  }) };
}

test('cached context is reused and changed symbols clear summary and references', async () => {
  let count = 0;
  const { ui, get } = fixture(async () => { count++; return response(); });
  await ui.ensure();
  await ui.ensure();
  assert.equal(count, 1);
  assert.equal(ui.requestFields().rag_context.length, 1);
  get('symbol').value = 'MSFT';
  get('symbol').listeners.input();
  assert.equal(get('klineSummary').value, '');
  assert.equal(ui.requestFields().rag_context.length, 0);
  assert.equal(get('marketFacts').hidden, true);
});

test('late response cannot overwrite newer form values', async () => {
  let resolve;
  const { ui, get } = fixture(() => new Promise((r) => { resolve = r; }));
  const checking = assert.rejects(ui.ensure(), /交易条件/);
  get('symbol').value = 'MSFT';
  ui.invalidate();
  resolve(response());
  await checking;
  assert.equal(get('klineSummary').value, '');
  assert.equal(ui.requestFields().rag_context.length, 0);
});

test('provider failure does not fabricate context or prevent retry', async () => {
  const { ui, get } = fixture(async () => ({ ok: false, json: async () => ({ detail: { message: 'provider unavailable' } }) }));
  await assert.rejects(ui.ensure(), /provider unavailable/);
  assert.equal(get('fetchMarket').disabled, false);
  assert.equal(get('klineSummary').value, '');
  assert.equal(ui.requestFields().rag_context.length, 0);
});

test('language changes invalidate notes; manual mode is labeled and uses no API', async () => {
  let count = 0;
  const { ui, get, setLanguage } = fixture(async () => { count++; return response(); });
  await ui.ensure();
  setLanguage('ko-KR');
  ui.localize();
  assert.equal(get('klineSummary').value, '');
  assert.equal(get('autoMarketLabel').textContent, '매수 전 일봉 자동 조회');
  get('autoMarket').checked = false;
  get('autoMarket').listeners.change();
  get('klineSummary').value = 'manual';
  await ui.ensure();
  assert.equal(count, 1);
  assert.match(ui.requestFields().market_snapshot.kline_summary, /미검증/);
  assert.equal(get('klineSummary').readOnly, false);
});
