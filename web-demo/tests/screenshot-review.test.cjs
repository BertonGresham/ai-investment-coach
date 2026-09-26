const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../screenshot-review.js'), 'utf8');
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
    addEventListener(name, callback) { this.listeners[name] = callback; },
  });
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); };
  let language = 'zh-CN';
  let api = 'http://test';
  const context = vm.createContext({
    document: { getElementById: get, createElement: makeNode },
    fetch, AbortController, Date,
    URL: { createObjectURL: (file) => `blob:${file.name}`, revokeObjectURL: (url) => revoked.push(url) },
    FormData: class { append() {} },
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(timer) { timers.delete(timer); },
  });
  vm.runInContext(script, context);
  const ui = context.createScreenshotReview({ getLanguage: () => language, getApiBase: () => api, onApply: (result) => applied.push(result) });
  function select(name = 'synthetic.png', extra = {}) {
    get('screenshotFile').files = [{ name, type: 'image/png', size: 100, ...extra }];
    get('screenshotFile').listeners.change();
  }
  return { ui, get, select, applied, revoked, timers, time: context.screenshotLocalTime,
    recognize: () => get('recognizeScreenshot').listeners.click(),
    click: (id) => get(id).listeners.click(),
    setLanguage(value) { language = value; ui.localize(); },
    setApi(value) { api = value; get('apiUrl').listeners.input(); },
  };
}
function response(overrides = {}) {
  return { ok: true, json: async () => ({
    status: 'recognized', fields: { symbol: 'AAPL', buy_time: '2025-07-25', buy_price: 213.76 },
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

test('date-only and timezone-free values never become invented midnight times', () => {
  const f = fixture();
  for (const value of [null, '', '2025-07-25', '2025-07-25T10:30:00', 'not-a-date']) assert.equal(f.time(value), '');
  const input = '2025-07-25T10:30:45-04:00';
  assert.equal(new Date(f.time(input)).getTime(), new Date(input).getTime());
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
    f.ui.assertReady();
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
  f.ui.assertReady();
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

