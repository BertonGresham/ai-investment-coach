// Integration helper for the team's web pages. The caller owns UI and session storage.
export function backendClient(baseUrl, getToken) {
  async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetch(`${baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw Object.assign(new Error(data?.message || 'Backend request failed'), { status: response.status });
    return data;
  }
  return {
    register: (username, email, password) => request('/api/auth/register', { method: 'POST', body: { username, email, password } }),
    login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    me: () => request('/api/me'),
    // Reuse one key when retrying the same submission; generate a new key for a new trade.
    saveTrade: (payload, key) => request('/api/trades', { method: 'POST', body: payload, idempotencyKey: key }),
    analyze: (id) => request(`/api/trades/${encodeURIComponent(id)}/analysis`, { method: 'POST' }),
    trade: (id) => request(`/api/trades/${encodeURIComponent(id)}`),
    report: (id) => request(`/api/trades/${encodeURIComponent(id)}/report`),
    trades: () => request('/api/trades'),
    reports: () => request('/api/reports'),
  };
}
