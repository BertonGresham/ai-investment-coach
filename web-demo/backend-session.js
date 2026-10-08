(function (root) {
  "use strict";

  function backendUrl(value) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash ||
        !["http:", "https:"].includes(url.protocol) ||
        (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new Error("Use HTTPS, or HTTP on localhost, without credentials or query parameters.");
    }
    return url.href.replace(/\/$/, "");
  }

  // The business API owns identity, IDs and accounting. Only send its accepted fields.
  function persistedTrade(input, confirmed = false) {
    const original = input.trade;
    const executions = original.executions ? original.executions.map((row) => ({
      execution_id: row.execution_id, side: row.side, time: row.time,
      price: row.price, quantity: row.quantity, reason: row.reason ?? null,
    })) : [{ execution_id: "buy-1", side: "buy", time: original.buy_time,
      price: original.buy_price, quantity: original.quantity, reason: input.decision?.buy_reason ?? null }];
    if (!original.executions && original.sell_time != null && original.sell_price != null) {
      executions.push({ execution_id: "sell-1", side: "sell", time: original.sell_time,
        price: original.sell_price, quantity: original.quantity, reason: input.decision?.sell_reason ?? null });
    }
    return {
      stock: { ...input.stock },
      trade: { executions, execution_order_confirmed: original.execution_order_confirmed === true || confirmed },
      decision: input.decision || {},
      ...(input.market_snapshot ? { market_snapshot: input.market_snapshot } : {}),
      ...(input.analysis_context ? { analysis_context: input.analysis_context } : {}),
      ...(input.rag_context ? { rag_context: input.rag_context } : {}),
    };
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  class BackendSession {
    constructor(base, { storage = root.sessionStorage, fetcher = root.fetch.bind(root), onReset = () => {} } = {}) {
      this.base = backendUrl(base);
      this.storage = storage;
      this.fetcher = fetcher;
      this.onReset = onReset;
      this.version = 0;
      this.key = `aiCoachSession:${this.base}`;
      this.session = null;
      this.ready = false;
      try {
        const saved = JSON.parse(storage.getItem(this.key));
        if (saved?.access_token && saved?.user?.user_id && Date.parse(saved.expires_at) > Date.now()) this.session = saved;
        else storage.removeItem(this.key);
      } catch { /* Storage may be disabled; an in-memory login still works. */ }
    }
    get user() { return this.ready ? this.session?.user : null; }
    clear() {
      this.version += 1;
      this.ready = false;
      this.session = null;
      this.pending = null;
      try { this.storage.removeItem(this.key); this.storage.removeItem(`${this.key}:submission`); } catch {}
      this.onReset();
    }
    async request(path, { method = "GET", body, key, publicRequest = false } = {}) {
      const version = this.version;
      const token = this.session?.access_token;
      if (!publicRequest && !token) throw Object.assign(new Error("Login required"), { status: 401 });
      const headers = {};
      if (!publicRequest) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (key) headers["Idempotency-Key"] = key;
      let response;
      try {
        response = await this.fetcher(`${this.base}${path}`, {
          method, headers, body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(65000), redirect: "error", credentials: "omit",
        });
      } catch (error) {
        if (version !== this.version) throw Object.assign(new Error("Session changed"), { stale: true });
        throw Object.assign(new Error("Backend unavailable"), { status: 0, cause: error });
      }
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (version !== this.version) throw Object.assign(new Error("Session changed"), { stale: true });
      if (!response.ok) {
        if (response.status === 401 && !publicRequest) this.clear();
        throw Object.assign(new Error(data?.message || "Backend request failed"), { status: response.status });
      }
      if (response.status !== 204 && data === null) throw new Error("Invalid backend response");
      return data;
    }
    async restore() {
      if (!this.session) return null;
      const user = await this.request("/api/me");
      this.session.user = user;
      this.ready = true;
      return user;
    }
    async authenticate(register, fields) {
      this.clear();
      const session = await this.request(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST", body: fields, publicRequest: true,
      });
      this.session = session;
      this.ready = true;
      try { this.storage.setItem(this.key, JSON.stringify(session)); } catch {}
      return session.user;
    }
    async logout() {
      try { if (this.session) await this.request("/api/auth/logout", { method: "POST" }); }
      finally { this.clear(); }
    }
    list(offset = 0, limit = 20) { return this.request(`/api/trades?offset=${offset}&limit=${limit}`); }
    detail(id) { return this.request(`/api/trades/${encodeURIComponent(id)}`); }
    report(id) { return this.request(`/api/trades/${encodeURIComponent(id)}/report`); }
    analyze(id) { return this.request(`/api/trades/${encodeURIComponent(id)}/analysis`, { method: "POST" }); }
    async submit(payload) {
      if (!this.user) throw Object.assign(new Error("Login required"), { status: 401 });
      const version = this.version;
      const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(payload)));
      if (version !== this.version) throw Object.assign(new Error("Session changed"), { stale: true });
      const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const storageKey = `${this.key}:submission`;
      let pending = this.pending;
      try { pending = JSON.parse(this.storage.getItem(storageKey)) || pending; } catch {}
      if (pending?.fingerprint !== fingerprint || pending?.user !== this.user.user_id) {
        pending = { fingerprint, user: this.user.user_id, key: root.crypto.randomUUID() };
      }
      this.pending = pending;
      // Save before POST: an ambiguous network failure must retry with the same key.
      try { this.storage.setItem(storageKey, JSON.stringify(pending)); } catch {}
      const trade = await this.request("/api/trades", { method: "POST", body: payload, key: pending.key });
      try { return { trade, report: await this.analyze(trade.trade_id) }; }
      catch (error) { error.savedTrade = trade; throw error; }
    }
    async profileReports() {
      const version = this.version;
      const unique = new Map();
      let offset = 0;
      while (offset < 500) {
        const page = await this.request(`/api/reports?offset=${offset}&limit=100`);
        if (version !== this.version) throw Object.assign(new Error("Session changed"), { stale: true });
        page.forEach(report => unique.set(report.trade_id, report));
        offset += page.length;
        if (page.length < 100) break;
      }
      return [...unique.values()];
    }
  }
  const api = { BackendSession, backendUrl, persistedTrade };
  if (typeof module !== "undefined") module.exports = api;
  else Object.assign(root, api);
})(globalThis);
