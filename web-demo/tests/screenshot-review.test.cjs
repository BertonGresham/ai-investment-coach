const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = ['execution-ledger.js', 'screenshot-review.js'].map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
function fixture(fetch) {
  const nodes = new Map();
  const revoked = [];
  const applied = [];
  const timers = new Set();
  const makeNode = () => ({
    value: '', files: [], hidden: true, textContent: '', dataset: {}, children: [], listeners: {},
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    removeAttribute(name) { delete this[name]; },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
  });
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, { ...makeNode(), id }); return nodes.get(id); };
  let language = 'zh-CN';
  let api = 'http://test';
  const context = vm.createContext({
    document: { getElementById: get, createElement: makeNode },
    fetch, AbortController, Date,
    URL: { createObjectURL: (file) => `blob:${file.name}`, revokeObjectURL: (url) => revoked.push(url) },
    FormData: class { constructor() { this.values = new Map(); } append(key, value) { this.values.set(key, value); } get(key) { return this.values.get(key); } },
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(timer) { timers.delete(timer); },
  });
  vm.runInContext(script, context);
  const ui = context.createScreenshotReview({ getLanguage: () => language, getApiBase: () => api, onApply: (result) => applied.push(result) });
  function select(name = 'synthetic.png', extra = {}) {
    selectMany([{ name, ...extra }]);
  }
  function selectMany(files) {
    get('screenshotFile').files = files.map((file) => ({ type: 'image/png', size: 100, ...file }));
    get('screenshotFile').listeners.change();
  }
  return { ui, get, select, selectMany, applied, revoked, timers, time: context.screenshotLocalTime,
    mergeRecords: context.mergeScreenshotRecords,
    summarize: context.summarizeExecutions,
    setTime: context.setRecordedTimeInput, readTime: context.readRecordedTimeInput, formatTime: context.formatRecordedTime,
    checkMerge(index, checked = true) {
      const target = get('screenshotQueue').children[index].children[1];
      target.checked = checked;
      get('tradeForm').listeners.input({ target });
      target.listeners.change();
      get('tradeForm').listeners.change({ target });
    },
    acknowledge(checked = true) {
      const target = get('confirmSameTrade');
      target.checked = checked;
      get('tradeForm').listeners.input({ target });
      target.listeners.change();
      get('tradeForm').listeners.change({ target });
    },
    choose: (index) => get('screenshotQueue').children[index].children[0].listeners.click(),
    recognize: () => get('recognizeScreenshot').listeners.click(),
    click: (id) => get(id).listeners.click(),
    setLanguage(value) { language = value; ui.localize(); },
    setApi(value) { api = value; get('apiUrl').listeners.input(); },
  };
}
function response(overrides = {}) {
  return { ok: true, json: async () => ({
    status: 'recognized', fields: { symbol: 'AAPL', buy_time: '2025-07-25', buy_price: 213.76 },
    record: { kind: 'security_trade', side: 'buy', label: 'Buy' },
    field_confidence: { symbol: 0.95, buy_price: 0.6 }, warnings: ['Synthetic result.'], notice: 'Confirm fields.', ...overrides,
  }) };
}

test('recognition is a draft until explicit confirmation and blocks analysis', async () => {
  const f = fixture(async () => response());
  f.select();
  await f.recognize();
  assert.equal(f.applied.length, 0);
  assert.equal(f.get('screenshotReview').hidden, false);
  assert.throws(() => f.ui.assertReady(), /确认/);
  assert.equal(f.get('screenshotReviewRows').children.length, 9);
  assert.equal(f.get('screenshotReviewRows').children[4].dataset.review, 'true');
  assert.match(f.get('screenshotReviewWarnings').children.map((x) => x.textContent).join(' '), /时区/);
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 1);
  assert.equal(f.applied[0].fields.symbol, 'AAPL');
  f.ui.assertReady();
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 1);
  assert.equal(f.timers.size, 0);
});

test('cancel keeps form unchanged and provider content is rendered only as text', async () => {
  const f = fixture(async () => response({ fields: { symbol: '<img src=x onerror=alert(1)>' } }));
  f.select();
  await f.recognize();
  assert.equal(f.get('screenshotReviewRows').children[0].children[1].textContent, '<img src=x onerror=alert(1)>');
  f.click('cancelScreenshot');
  assert.equal(f.applied.length, 0);
  assert.equal(f.get('screenshotReview').hidden, true);
  f.ui.assertReady();
});

test('cash flows cannot replace fields or analyze a stale sample, including after language changes', async () => {
  const f = fixture(async () => response({ status: 'not_trade', record: { kind: 'cash_flow', label: '<img src=x onerror=alert(1)>', side: 'unknown' }, fields: { quantity: 0, buy_price: 109 } }));
  f.select();
  await f.recognize();
  assert.equal(f.get('screenshotReview').hidden, true);
  assert.match(f.get('ocrStatus').textContent, /资金流水/);
  assert.match(f.get('ocrStatus').textContent, /<img src=x/);
  assert.throws(() => f.ui.assertReady(), /资金流水/);
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 0);
  f.setLanguage('ko-KR');
  assert.match(f.get('ocrStatus').textContent, /자금 내역/);
  assert.throws(() => f.ui.assertReady(), /자금 내역/);
  f.click('removeScreenshot');
  f.ui.assertReady();
});

test('an unknown type or direction is blocked even if it includes trade-like fields', async () => {
  for (const record of [undefined, { kind: 'unknown' }, { kind: 'security_trade', side: 'unknown' }]) {
    const f = fixture(async () => response({ record }));
    f.select();
    await f.recognize();
    assert.equal(f.get('screenshotReview').hidden, true);
    assert.throws(() => f.ui.assertReady(), /无法确认/);
    assert.equal(f.applied.length, 0);
  }
});

test('single-sided execution review explains the missing side', async () => {
  for (const side of ['buy', 'sell']) {
    const f = fixture(async () => response({ record: { kind: 'security_trade', side } }));
    f.select();
    await f.recognize();
    const warnings = f.get('screenshotReviewWarnings').children.map((x) => x.textContent).join(' ');
    assert.match(warnings, side === 'buy' ? /仅记录买入/ : /仅记录卖出/);
  }
});

test('date-only and timezone-free values never become invented midnight times', () => {
  const f = fixture();
  for (const value of [null, '', '2025-07-25', '2025-07-25T10:30:00', 'not-a-date']) assert.equal(f.time(value), '');
  const input = '2025-07-25T10:30:45-04:00';
  assert.equal(new Date(f.time(input)).getTime(), new Date(input).getTime());
});

test('recorded date and local clock prefill without inventing midnight or timezone', () => {
  const f = fixture(), input = f.get('testTime');
  for (const value of ['2026-05-13', '2026-05-13T11:30:00', '2026-05-13T11:30:00+09:00']) {
    f.setTime(input, value);
    assert.equal(f.readTime(input), value);
    assert.equal(input.type, value.length === 10 ? 'date' : 'datetime-local');
  }
  f.setTime(input, '2026-02-30');
  assert.equal(input.value, '');
  assert.equal(f.formatTime('2026-05-13', 'zh-CN'), '2026-05-13 (时刻未记录)');
  assert.doesNotMatch(f.formatTime('2026-05-13', 'ko-KR'), /00:00/);
});

test('date-only screenshots merge without manual time or reason entry', async () => {
  const entries = [execution('sell', { sell_time: '2026-05-14' }), execution('buy', { buy_time: '2026-05-13' })];
  let i = 0;
  const f = fixture(async () => response(entries[i++].result));
  f.selectMany(entries); await f.recognize();
  f.checkMerge(0); f.checkMerge(1); f.click('mergeScreenshots');
  assert.equal(f.get('mergeExecutionError').hidden, true);
  f.acknowledge(); f.click('confirmScreenshot');
  assert.equal(f.applied[0].fields.buy_time, '2026-05-13');
  assert.equal(f.applied[0].executions[0].reason, null);
  assert.equal(f.applied[0].execution_order_confirmed, true);
});

test('same-day date-only rows require explicit order confirmation', async () => {
  const entries = [execution('buy', { buy_time: '2026-05-13' }), execution('sell', { sell_time: '2026-05-13' })];
  let i = 0;
  const f = fixture(async () => response(entries[i++].result));
  f.selectMany(entries); await f.recognize();
  f.checkMerge(0); f.checkMerge(1); f.click('mergeScreenshots');
  assert.equal(f.get('confirmScreenshot').disabled, true);
  assert.match(f.get('mergeExecutionError').textContent, /顺序/);
  f.acknowledge();
  assert.equal(f.get('confirmScreenshot').disabled, false);
  f.click('confirmScreenshot');
  assert.equal(f.summarize(f.applied[0].executions, 'zh-CN', true).realized_profit_loss, -20);
});

test('visible details and computed fields are labeled and currency conflicts blocked', async () => {
  const f = fixture(async () => response({ details: { fee: 395, tax: 0 }, derived_fields: ['buy_price'] }));
  f.select(); await f.recognize();
  assert.match(f.get('screenshotReviewRows').children[4].children[1].children[0].textContent, /计算/);
  assert.equal(f.get('screenshotReviewRows').children.length, 11);
  const a = execution('buy'), b = execution('sell');
  a.result.details = {currency:'USD'}; b.result.details = {currency:'KRW'};
  assert.equal(f.mergeRecords([a,b]).error, 'mergeCurrency');
});

test('replacing image ignores late success and revokes old preview', async () => {
  let resolve;
  let signal;
  const f = fixture((_, options) => { signal = options.signal; return new Promise((r) => { resolve = r; }); });
  f.select('first.png');
  const pending = f.recognize();
  assert.throws(() => f.ui.assertReady(), /识别中/);
  f.select('second.png');
  assert.equal(signal.aborted, true);
  resolve(response());
  await pending;
  assert.equal(f.get('screenshotReview').hidden, true);
  assert.deepEqual(f.revoked, ['blob:first.png']);
  assert.equal(f.applied.length, 0);
  assert.equal(f.get('recognizeScreenshot').disabled, false);
});

test('remove, language, API, and form changes invalidate in-flight results', async () => {
  for (const action of [
    (f) => { f.get('screenshotFile').files = []; f.ui.clear(); },
    (f) => f.setLanguage('ko-KR'),
    (f) => f.setApi('http://new-api'),
    (f) => f.get('tradeForm').listeners.input({ target: { id: 'buyReason' } }),
  ]) {
    let resolve;
    const f = fixture(() => new Promise((r) => { resolve = r; }));
    f.select();
    const pending = f.recognize();
    action(f);
    resolve(response());
    await pending;
    assert.equal(f.applied.length, 0);
    assert.equal(f.get('screenshotReview').hidden, true);
    if (f.get('screenshotQueue').children.length) assert.throws(() => f.ui.assertReady(), /识别|인식/);
    else f.ui.assertReady();
  }
});

test('old failure cannot hide a newer successful draft', async () => {
  let reject;
  let calls = 0;
  const f = fixture(() => ++calls === 1 ? new Promise((_, r) => { reject = r; }) : Promise.resolve(response()));
  f.select();
  const old = f.recognize();
  f.select('second.png');
  await f.recognize();
  reject(new TypeError('old network error'));
  await old;
  assert.equal(f.get('screenshotReview').hidden, false);
  assert.equal(f.get('ocrStatus').hidden, true);
});

test('mock, empty, invalid JSON, and service errors never apply fields', async () => {
  for (const result of [response({ status: 'mock' }), response({ status: 'needs_review', fields: {} }),
    { ok: true, json: async () => { throw new SyntaxError(); } }, { ok: false, status: 503 }]) {
    const f = fixture(async () => result);
    f.select();
    await f.recognize();
    assert.equal(f.applied.length, 0);
    assert.equal(f.get('screenshotReview').hidden, true);
    assert.equal(f.get('ocrStatus').dataset.state, 'error');
    assert.equal(f.get('recognizeScreenshot').disabled, false);
    assert.equal(f.timers.size, 0);
  }
});

test('timeout aborts the request and leaves a retryable localized state', async () => {
  const f = fixture((_, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })));
  }));
  f.setLanguage('ko-KR');
  f.select();
  const pending = f.recognize();
  for (const callback of f.timers) callback();
  await pending;
  assert.match(f.get('ocrStatus').textContent, /초과/);
  assert.equal(f.get('recognizeScreenshot').disabled, false);
  assert.throws(() => f.ui.assertReady(), /초과/);
});

test('invalid uploads never reach the service', async () => {
  let calls = 0;
  const f = fixture(() => { calls++; });
  for (const data of [{ type: 'text/plain' }, { size: 8 * 1024 * 1024 + 1 }]) {
    f.select('invalid', data);
    assert.equal(f.get('uploadPreview').hidden, true);
    assert.equal(f.get('ocrStatus').dataset.state, 'error');
  }
  assert.equal(calls, 0);
});

test('multiple files are sent sequentially and keep independent classifications and fields', async () => {
  const calls = [];
  let concurrent = 0;
  const f = fixture(async (_, options) => {
    const name = options.body.get('file').name;
    calls.push(name);
    assert.equal(++concurrent, 1);
    await Promise.resolve();
    concurrent--;
    return name === 'cash.png' ? response({ status: 'not_trade', record: { kind: 'cash_flow', side: 'unknown', label: '예탁금이용료입금' }, fields: {} })
      : response({ fields: { symbol: name === 'buy.png' ? 'AAPL' : 'MSFT' } });
  });
  f.selectMany([{ name: 'cash.png' }, { name: 'buy.png' }, { name: 'other.png' }]);
  assert.equal(calls.length, 0);
  assert.equal(f.get('screenshotQueue').children.length, 3);
  await f.recognize();
  assert.deepEqual(calls, ['cash.png', 'buy.png', 'other.png']);
  assert.match(f.get('screenshotProgress').textContent, /3 \/ 3/);
  assert.throws(() => f.ui.assertReady(), /资金流水/);
  f.choose(1);
  assert.equal(f.get('screenshotReviewRows').children[0].children[1].textContent, 'AAPL');
  f.click('confirmScreenshot');
  assert.equal(f.applied[0].fields.symbol, 'AAPL');
  f.ui.assertReady();
  f.choose(2);
  assert.throws(() => f.ui.assertReady(), /确认/);
  f.click('confirmScreenshot');
  assert.equal(f.applied[1].fields.symbol, 'MSFT');
  f.choose(1);
  assert.throws(() => f.ui.assertReady(), /确认/);
  assert.equal(f.get('recognizeScreenshot').disabled, true);
});

test('a failed item does not discard other results and only failures are retried', async () => {
  const calls = [];
  let fail = true;
  const f = fixture(async (_, options) => {
    const name = options.body.get('file').name;
    calls.push(name);
    return fail && name === 'bad.png' ? { ok: false, status: 502 } : response();
  });
  f.selectMany([{ name: 'ok.png' }, { name: 'bad.png' }, { name: 'last.png' }]);
  await f.recognize();
  assert.equal(f.get('screenshotReview').hidden, false);
  f.choose(1);
  assert.equal(f.get('ocrStatus').dataset.state, 'error');
  fail = false;
  await f.recognize();
  assert.deepEqual(calls, ['ok.png', 'bad.png', 'last.png', 'bad.png']);
  assert.equal(f.get('screenshotReview').hidden, false);
  assert.equal(f.timers.size, 0);
});

test('stop preserves completed results, ignores a late response, and resumes remaining files', async () => {
  const calls = [];
  let resolve;
  let signal;
  const f = fixture((_, options) => {
    const name = options.body.get('file').name;
    calls.push(name);
    if (calls.length === 2) { signal = options.signal; return new Promise((r) => { resolve = r; }); }
    return Promise.resolve(response());
  });
  f.selectMany([{ name: 'one.png' }, { name: 'two.png' }, { name: 'three.png' }]);
  const pending = f.recognize();
  await new Promise(setImmediate);
  assert.equal(f.get('confirmScreenshot').disabled, true);
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 0);
  f.click('stopScreenshots');
  assert.equal(signal.aborted, true);
  assert.equal(f.get('screenshotReview').hidden, false);
  resolve(response({ fields: { symbol: 'STALE' } }));
  await pending;
  assert.deepEqual(calls, ['one.png', 'two.png']);
  await f.recognize();
  assert.deepEqual(calls, ['one.png', 'two.png', 'two.png', 'three.png']);
  f.choose(1);
  assert.equal(f.get('screenshotReviewRows').children[0].children[1].textContent, 'AAPL');
});

test('switching the preview during a batch does not change request ownership', async () => {
  let resolve;
  const f = fixture((_, options) => options.body.get('file').name === 'first.png'
    ? new Promise((r) => { resolve = r; }) : Promise.resolve(response({ fields: { symbol: 'MSFT' } })));
  f.selectMany([{ name: 'first.png' }, { name: 'second.png' }]);
  const pending = f.recognize();
  f.choose(1);
  resolve(response());
  await pending;
  assert.equal(f.get('screenshotPreview').alt, 'second.png');
  assert.equal(f.get('screenshotReviewRows').children[0].children[1].textContent, 'MSFT');
  f.choose(0);
  assert.equal(f.get('screenshotReviewRows').children[0].children[1].textContent, 'AAPL');
});

test('limits reject the whole new selection without losing existing reviewed results', async () => {
  const f = fixture(async () => response());
  f.select('original.png');
  await f.recognize();
  for (const files of [
    Array.from({ length: 11 }, (_, i) => ({ name: `${i}.png` })),
    Array.from({ length: 5 }, (_, i) => ({ name: `${i}.png`, size: 8 * 1024 * 1024 })),
    [{ name: 'oversize.png', size: 8 * 1024 * 1024 + 1 }],
    [{ name: 'ok.png' }, { name: 'bad.txt', type: 'text/plain' }],
  ]) {
    f.selectMany(files);
    assert.equal(f.get('ocrStatus').dataset.state, 'error');
    assert.equal(f.get('screenshotQueue').children.length, 1);
    assert.equal(f.get('screenshotPreview').alt, 'original.png');
    assert.equal(f.get('screenshotReview').hidden, false);
  }
  assert.deepEqual(f.revoked, []);
  f.selectMany([]);
  assert.equal(f.get('screenshotQueue').children.length, 1);
});

test('removing one file preserves its neighbours, clearing releases every preview', async () => {
  const f = fixture(async () => response());
  f.selectMany([{ name: 'one.png' }, { name: 'two.png' }, { name: 'three.png' }]);
  await f.recognize();
  f.choose(1);
  f.click('removeScreenshot');
  assert.equal(f.get('screenshotQueue').children.length, 2);
  assert.equal(f.get('screenshotPreview').alt, 'three.png');
  assert.equal(f.get('screenshotReview').hidden, false);
  assert.deepEqual(f.revoked, ['blob:two.png']);
  f.click('clearScreenshots');
  assert.deepEqual(f.revoked, ['blob:two.png', 'blob:one.png', 'blob:three.png']);
  assert.equal(f.get('screenshotQueue').hidden, true);
  assert.equal(f.get('uploadPreview').hidden, true);
  assert.equal(f.get('recognizeScreenshot').disabled, true);
  f.ui.assertReady();
});

test('language changes retain completed results without a second paid request', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return response(); });
  f.selectMany([{ name: 'one.png' }, { name: 'two.png' }]);
  await f.recognize();
  f.setLanguage('ko-KR');
  assert.equal(f.get('screenshotReview').hidden, false);
  assert.match(f.get('screenshotProgress').textContent, /2 \/ 2장/);
  assert.match(f.get('screenshotQueue').children[0].children[0].children[1].textContent, /매수.*확인 필요/);
  await f.recognize();
  assert.equal(calls, 2);
  f.click('cancelScreenshot');
  f.ui.assertReady();
  f.choose(0);
  assert.equal(f.get('screenshotReview').hidden, false);
});

test('configuration and mock failures stop the batch before sending remaining images', async () => {
  for (const result of [{ ok: false, status: 503 }, { ok: false, status: 429 }, response({ status: 'mock' })]) {
    let calls = 0;
    const f = fixture(async () => { calls++; return result; });
    f.selectMany([{ name: 'one.png' }, { name: 'two.png' }]);
    await f.recognize();
    assert.equal(calls, 1);
    assert.equal(f.get('recognizeScreenshot').disabled, false);
    assert.equal(f.get('stopScreenshots').hidden, true);
    assert.equal(f.timers.size, 0);
  }
});

function execution(side, fields = {}) {
  return { name: `${side}.png`, result: {
    status: 'recognized', record: { kind: 'security_trade', side, label: side },
    fields: { symbol: 'AAPL', market: 'US', quantity: 10,
      [`${side}_price`]: side === 'buy' ? 200 : 198,
      [`${side}_time`]: `2026-09-${side === 'buy' ? '15' : '16'}T10:00:00-04:00`, ...fields },
    field_confidence: { symbol: side === 'buy' ? 0.95 : 0.8, quantity: 0.9 }, warnings: [],
  } };
}

test('buy and sell screenshots merge by side regardless of upload order, with provenance and no mutation', () => {
  const f = fixture();
  const entries = [execution('sell', { buy_price: 999, buy_reason: 'guessed' }), execution('buy', { sell_price: 777 })];
  const before = JSON.stringify(entries);
  const { result } = f.mergeRecords(entries);
  assert.equal(result.fields.buy_price, 200);
  assert.equal(result.fields.sell_price, 198);
  assert.equal(result.fields.quantity, 10);
  assert.equal(result.fields.buy_reason, null);
  assert.equal(result.fields.sell_reason, null);
  assert.equal(result.field_confidence.symbol, 0.8);
  assert.equal(result.executions.find((row) => row.side === 'buy').source, 'buy.png');
  assert.equal(result.executions.find((row) => row.side === 'sell').source, 'sell.png');
  assert.equal(JSON.stringify(entries), before);
});

test('different stocks and markets block merging; incomplete executions remain correctable', () => {
  const f = fixture();
  for (const [fields, key] of [
    [{ symbol: 'MSFT' }, 'mergeSymbol'], [{ market: 'KR' }, 'mergeMarket'],
  ]) assert.equal(f.mergeRecords([execution('buy'), execution('sell', fields)]).error, key);
  assert.equal(f.mergeRecords([execution('buy'), execution('sell', { symbol: ' aapl ', market: 'us' })]).result.fields.symbol, 'AAPL');
  for (const fields of [{ quantity: 0 }, { quantity: '10' }, { quantity: 1.5 }, { sell_time: '2026-09-15T12:00:00Z' }]) {
    const { result } = f.mergeRecords([execution('buy'), execution('sell', fields)]);
    assert.throws(() => f.summarize(result.executions));
  }
  const partial = f.mergeRecords([execution('buy'), execution('sell', { quantity: 5 })]);
  assert.equal(f.summarize(partial.result.executions).remaining_quantity, 5);
});

test('missing identity warns and unpaired quantities remain empty instead of implying a full exit', () => {
  const f = fixture();
  const { result } = f.mergeRecords([execution('buy'), execution('sell', { symbol: null, market: null, quantity: null, sell_time: '2026-09-16' })]);
  assert.equal(result.fields.symbol, 'AAPL');
  assert.equal(result.fields.quantity, null);
  assert.equal(result.field_confidence.quantity, undefined);
  assert.deepEqual(Array.from(result.merge_warnings), ['mergeIdentity']);
  assert.equal(result.executions[1].quantity, null);
  assert.equal(result.executions[1].time, '2026-09-16');
});

test('cash flows, unknown records and selections outside 2 to 10 cannot merge', () => {
  const f = fixture();
  for (const entries of [
    [], [execution('buy')], [execution('buy'), execution('unknown')], Array.from({ length: 11 }, () => execution('buy')),
    [execution('buy'), { ...execution('sell'), result: { ...execution('sell').result, status: 'not_trade', record: { kind: 'cash_flow', side: 'sell' } } }],
  ]) assert.equal(f.mergeRecords(entries).error, 'mergeSides');
});

async function mergeFixture(sellFields = {}) {
  const f = fixture(async (_, options) => {
    const side = options.body.get('file').name === 'buy.png' ? 'buy' : 'sell';
    return response(execution(side, side === 'sell' ? sellFields : {}).result);
  });
  f.selectMany([{ name: 'buy.png' }, { name: 'sell.png' }]);
  await f.recognize();
  f.checkMerge(0);
  f.checkMerge(1);
  f.click('mergeScreenshots');
  return f;
}

test('a merged review requires same-position acknowledgement and fills both sides in one operation', async () => {
  const f = await mergeFixture();
  assert.equal(f.get('mergeAcknowledgement').hidden, false);
  assert.match(f.get('screenshotReviewTitle').textContent, /合并/);
  assert.equal(f.get('confirmScreenshot').disabled, true);
  assert.throws(() => f.ui.assertReady(), /确认/);
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 0);
  const rows = f.get('mergeExecutionEditor').children[0].children[0].children[1].children;
  assert.match(rows[0].children[0].textContent, /buy.png/);
  assert.match(rows[1].children[0].textContent, /sell.png/);
  f.choose(1);
  assert.match(f.get('screenshotReviewTitle').textContent, /合并/);
  f.acknowledge();
  assert.equal(f.get('confirmScreenshot').disabled, false);
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 1);
  assert.equal(f.applied[0].fields.buy_price, 200);
  assert.equal(f.applied[0].fields.sell_price, 198);
  assert.equal(f.applied[0].fields.quantity, 10);
  assert.equal(f.applied[0].record.side, 'round_trip');
  assert.match(f.get('ocrStatus').textContent, /已合并/);
  f.choose(1);
  f.ui.assertReady();
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 1);
});

test('selection or source changes invalidate merged acknowledgement and prevent stale combined application', async () => {
  for (const action of [
    (f) => f.checkMerge(1, false), (f) => f.click('removeScreenshot'),
    (f) => f.ui.clear(), (f) => f.select('replacement.png'), (f) => f.setApi('http://changed'),
    (f) => f.get('tradeForm').listeners.input({ target: { id: 'buyReason' } }),
  ]) {
    const f = await mergeFixture();
    f.acknowledge();
    action(f);
    assert.equal(f.get('confirmSameTrade').checked, false);
    assert.equal(f.get('mergeAcknowledgement').hidden, true);
    assert.equal(f.applied.length, 0);
  }
});

test('conflicts stay visible, cannot be acknowledged away, and do not fall back to applying one side', async () => {
  for (const fields of [{ symbol: 'MSFT' }, { market: 'KR' }]) {
    const f = await mergeFixture(fields);
    assert.equal(f.get('ocrStatus').dataset.state, 'error');
    assert.match(f.get('ocrStatus').textContent, /不能合并/);
    assert.equal(f.get('confirmScreenshot').disabled, true);
    f.acknowledge();
    f.click('confirmScreenshot');
    assert.equal(f.applied.length, 0);
    assert.throws(() => f.ui.assertReady(), /确认/);
  }
});

test('language switches localize the merged review and require renewed acknowledgement without re-recognition', async () => {
  const f = await mergeFixture();
  f.acknowledge();
  f.setLanguage('ko-KR');
  assert.match(f.get('screenshotReviewTitle').textContent, /합친/);
  assert.match(f.get('mergeAcknowledgementText').textContent, /같은 계좌/);
  assert.equal(f.get('confirmSameTrade').checked, false);
  assert.equal(f.get('confirmScreenshot').disabled, true);
  assert.equal(f.get('screenshotReviewRows').children[5].children[1].textContent, '198');
  f.acknowledge();
  f.click('confirmScreenshot');
  assert.equal(f.applied.length, 1);
});

test('cancelled merging preserves the form and cash flows cannot enter the selection', async () => {
  const f = await mergeFixture();
  f.click('cancelScreenshot');
  assert.equal(f.applied.length, 0);
  assert.equal(f.get('mergeAcknowledgement').hidden, true);
  f.ui.assertReady();
  const cash = fixture(async () => response({ status: 'not_trade', record: { kind: 'cash_flow', side: 'unknown' } }));
  cash.selectMany([{ name: 'one.png' }, { name: 'two.png' }]);
  await cash.recognize();
  assert.equal(cash.get('screenshotQueue').children[0].children[1].disabled, true);
  cash.checkMerge(0);
  cash.checkMerge(1);
  assert.equal(cash.get('mergeScreenshots').disabled, true);
  cash.click('mergeScreenshots');
  assert.equal(cash.get('mergeAcknowledgement').hidden, true);
});

test('four screenshots preserve interleaved executions and quantity-weighted partial P&L', async () => {
  const data = [execution('buy', { buy_price: 100, buy_time: '2026-09-11T10:00:00Z' }),
    execution('sell', { sell_price: 120, quantity: 5, sell_time: '2026-09-12T10:00:00Z' }),
    execution('buy', { buy_price: 80, buy_time: '2026-09-13T10:00:00Z' }),
    execution('sell', { sell_price: 110, sell_time: '2026-09-14T10:00:00Z' })];
  const f = fixture(async (_, options) => response(data[Number(options.body.get('file').name[0])].result));
  f.selectMany(data.map((_, i) => ({ name: `${i}.png` })));
  await f.recognize();
  for (let i = 0; i < 4; i++) f.checkMerge(i);
  assert.equal(f.get('mergeScreenshots').disabled, false);
  f.click('mergeScreenshots'); f.acknowledge(); f.click('confirmScreenshot');
  const result = f.applied[0];
  assert.equal(result.executions.length, 4);
  const summary = f.summarize(result.executions);
  assert.equal(summary.average_buy_price, 90);
  assert.equal(summary.average_sell_price, 113.33333333);
  assert.equal(summary.realized_profit_loss, 333.33333333);
  assert.equal(summary.remaining_average_cost, 86.66666667);
  assert.equal(summary.remaining_quantity, 5);
  assert.deepEqual(Array.from(summary.timeline, (row) => row.occurrence), [1, 1, 2, 2]);
  f.ui.assertReady();
});

test('invalid quantities stay editable and each correction revokes acknowledgement', async () => {
  const f = await mergeFixture({ quantity: 11 });
  assert.equal(f.get('mergeExecutionError').hidden, false);
  f.acknowledge(); f.click('confirmScreenshot');
  assert.equal(f.applied.length, 0);
  const input = f.get('mergeExecutionEditor').children[0].children[0].children[1].children[1].children[3].children[0];
  input.value = '5'; input.listeners.input();
  f.get('tradeForm').listeners.input({ target: input });
  assert.equal(f.get('mergeAcknowledgement').hidden, false);
  assert.equal(f.get('confirmSameTrade').checked, false);
  assert.equal(f.get('mergeExecutionError').hidden, true);
  f.acknowledge(); f.click('confirmScreenshot');
  assert.equal(f.applied[0].executions[1].quantity, 5);
});

test('open positions, round trips and duplicates are handled explicitly', () => {
  const f = fixture();
  const open = f.mergeRecords([execution('buy'), execution('buy', { buy_price: 100, quantity: 30, buy_time: '2026-09-17T10:00:00Z' })]).result;
  assert.equal(f.summarize(open.executions).average_buy_price, 125);
  assert.equal(f.summarize(open.executions).realized_profit_loss, null);
  const trip = f.mergeRecords([execution('round_trip', { buy_time: '2026-09-10T10:00:00Z', sell_time: '2026-09-11T10:00:00Z', buy_price: 100, sell_price: 110 }), execution('buy')]).result;
  assert.equal(trip.executions.length, 3);
  assert.equal(f.summarize(trip.executions).remaining_quantity, 10);
  assert.throws(() => f.summarize(f.mergeRecords([execution('buy'), execution('buy')]).result.executions), /重复/);
});
