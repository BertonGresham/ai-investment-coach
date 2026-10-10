/* Account/history UI for the existing review page; no brokerage images are persisted. */
function createAccountReview({ getLanguage, onReset, onReport }) {
  const $ = id => document.getElementById(id);
  const copy = {
    "zh-CN": {
      mode: "记录模式", database: "账户历史", demo: "临时演示 · 不保存", account: "账户", backend: "业务后端地址",
      login: "登录", register: "注册", username: "昵称", email: "邮箱", password: "密码（12–128 位）", logout: "退出登录",
      guest: "未登录 · 交易尚未保存", demoStatus: "临时演示 · 刷新后清空", signed: "已登录", history: "历史记录", empty: "还没有保存的交易。",
      loginFirst: "请先登录，或切换到临时演示。", loading: "处理中…", refresh: "刷新记录", prev: "上一页", next: "下一页",
      open: "查看报告", retry: "生成 / 重试报告", COMPLETED: "报告已保存", PENDING: "交易已保存 · 待分析", FAILED: "交易已保存 · 分析失败",
      page: "页", saved: "交易已保存，分析暂未完成。可在历史记录中重试，不必重复录入。",
      offline: "无法连接业务后端，请检查地址或启动服务。没有改用模拟结果。", expired: "会话已过期，请重新登录。",
      conflict: "邮箱已注册，或提交与已有记录冲突。请核对后重试。", invalid: "请核对邮箱、密码及交易字段。",
      rejected: "交易未通过校验。请核对逐笔数量、价格、日期和先后顺序。", failed: "请求失败，请稍后重试。",
      credentials: "邮箱或密码不正确。", profileScope: "画像范围：账户最近最多 500 份已保存报告；Mock 与真实模型分别统计。",
      noReport: "所选来源尚无报告。", source: "画像来源", mock: "Mock 演示报告", llm: "真实模型报告",
    },
    "ko-KR": {
      mode: "기록 모드", database: "계정 이력", demo: "임시 데모 · 저장 안 됨", account: "계정", backend: "업무 백엔드 주소",
      login: "로그인", register: "가입", username: "이름", email: "이메일", password: "비밀번호 (12–128자)", logout: "로그아웃",
      guest: "로그인 전 · 거래 미저장", demoStatus: "임시 데모 · 새로고침 시 초기화", signed: "로그인됨", history: "저장 이력", empty: "저장된 거래가 없습니다.",
      loginFirst: "먼저 로그인하거나 임시 데모를 선택하세요.", loading: "처리 중…", refresh: "이력 새로고침", prev: "이전", next: "다음",
      open: "보고서 보기", retry: "보고서 생성 / 재시도", COMPLETED: "보고서 저장됨", PENDING: "거래 저장됨 · 분석 대기", FAILED: "거래 저장됨 · 분석 실패",
      page: "페이지", saved: "거래는 저장되었지만 분석은 완료되지 않았습니다. 이력에서 재시도할 수 있습니다.",
      offline: "업무 백엔드에 연결할 수 없습니다. 주소와 서비스를 확인하세요. 모의 결과로 대체하지 않았습니다.", expired: "세션이 만료되었습니다. 다시 로그인하세요.",
      conflict: "이미 가입된 이메일이거나 기존 제출과 충돌합니다. 확인 후 다시 시도하세요.", invalid: "이메일, 비밀번호와 거래 항목을 확인하세요.",
      rejected: "거래 검증에 실패했습니다. 체결 수량, 가격, 날짜와 순서를 확인하세요.", failed: "요청에 실패했습니다. 다시 시도하세요.",
      credentials: "이메일 또는 비밀번호가 일치하지 않습니다.", profileScope: "프로필 범위: 최근 저장 보고서 최대 500건. Mock과 실제 모델은 분리 집계합니다.",
      noReport: "선택한 출처의 보고서가 없습니다.", source: "프로필 출처", mock: "Mock 데모 보고서", llm: "실제 모델 보고서",
    },
  };
  const t = key => copy[getLanguage()][key];
  let client;
  let rows = [];
  let offset = 0;
  let busy = false;
  let generation = 0;
  const database = () => $("recordMode").value === "database";
  const errorText = (error, auth = false) => error.savedTrade ? t("saved") : error.status === 0 ? t("offline") :
    error.status === 401 ? t(auth ? "credentials" : "expired") : error.status === 409 ? t("conflict") :
    error.status === 400 ? t("invalid") : error.status === 422 ? t("rejected") : t("failed");
  function message(text = "", error = false) {
    $("accountMessage").textContent = text;
    $("accountMessage").hidden = !text;
    $("accountMessage").className = error ? "inline-error" : "field-hint";
  }
  function reset() {
    generation += 1;
    rows = []; offset = 0;
    onReset();
    render();
  }
  function connect() {
    if (client) client.clear();
    try {
      client = new BackendSession($("backendUrl").value.trim(), { onReset: reset });
      $("backendUrl").value = client.base;
      message();
    } catch { client = null; message(t("invalid"), true); }
    render();
  }
  function render() {
    document.querySelectorAll("[data-account-text]").forEach(node => { node.textContent = t(node.dataset.accountText); });
    const user = database() && client?.user;
    $("accountIdentity").textContent = !database() ? t("demoStatus") : user ? `${t("signed")} · ${user.username}` : t("guest");
    $("accountForm").hidden = !database() || !!user;
    $("logoutButton").hidden = !user;
    $("accountSettings").hidden = !database();
    $("authNameField").hidden = $("authAction").value !== "register";
    $("authName").required = $("authAction").value === "register";
    $("authPassword").autocomplete = $("authAction").value === "register" ? "new-password" : "current-password";
    $("authSubmit").textContent = busy ? t("loading") : t($("authAction").value);
    for (const id of ["authSubmit", "authAction", "logoutButton", "recordMode", "backendUrl", "historyRefresh", "historyPrev", "historyNext"]) $(id).disabled = busy;
    $("historyPrev").disabled = busy || !user || offset === 0;
    $("historyNext").disabled = busy || !user || rows.length < 20;
    $("historyPage").textContent = `${t("page")} ${offset / 20 + 1}`;
    $("historyRows").replaceChildren();
    $("historyEmpty").hidden = !!user && rows.length > 0;
    $("historyEmpty").textContent = !user ? t("loginFirst") : t("empty");
    for (const row of rows) {
      const item = document.createElement("li"); item.className = "history-row";
      const stock = document.createElement("div");
      const symbol = document.createElement("strong"); symbol.textContent = row.symbol; stock.append(symbol);
      const id = document.createElement("small"); id.textContent = row.trade_id; stock.append(id);
      const time = document.createElement("span"); time.textContent = new Date(row.created_at).toLocaleString(getLanguage());
      const status = document.createElement("span"); status.textContent = t(row.analysis_status) || row.analysis_status;
      const button = document.createElement("button"); button.type = "button"; button.className = "button";
      button.disabled = busy; button.textContent = t(row.analysis_status === "COMPLETED" ? "open" : "retry");
      button.addEventListener("click", () => action(async () => {
        const report = row.analysis_status === "COMPLETED" ? await client.report(row.trade_id) : await client.analyze(row.trade_id);
        onReport(row, report);
        await refresh();
      }));
      item.append(stock, time, status, button); $("historyRows").append(item);
    }
  }
  async function action(fn, auth = false) {
    if (busy) return;
    busy = true; message(); render();
    try { await fn(); }
    catch (error) { if (!error.stale) message(errorText(error, auth), true); }
    finally { busy = false; render(); }
  }
  async function refresh(nextOffset = offset) {
    if (!database() || !client?.user) return;
    const version = generation;
    const page = await client.list(nextOffset);
    if (generation !== version) return;
    offset = nextOffset; rows = page; render();
  }
  $("backendUrl").value = new URLSearchParams(location.search).get("backend") || "http://127.0.0.1:8080";
  $("backendUrl").addEventListener("change", () => action(async () => { connect(); await client?.restore(); await refresh(); }));
  $("authAction").addEventListener("change", render);
  $("accountForm").addEventListener("submit", event => {
    event.preventDefault();
    action(async () => {
      if (!client) throw new Error("Backend not configured");
      const register = $("authAction").value === "register";
      const fields = { email: $("authEmail").value.trim(), password: $("authPassword").value };
      if (register) fields.username = $("authName").value.trim();
      try { await client.authenticate(register, fields); }
      finally { $("authPassword").value = ""; }
      $("accountSettings").open = false;
      await refresh();
    }, true);
  });
  $("logoutButton").addEventListener("click", () => action(async () => { await client.logout(); $("accountSettings").open = true; }));
  $("recordMode").addEventListener("change", () => action(async () => {
    try { if (client?.session) await client.logout(); else reset(); }
    finally { $("accountSettings").open = true; render(); }
  }));
  $("historyRefresh").addEventListener("click", () => action(() => refresh(0)));
  $("historyPrev").addEventListener("click", () => action(() => refresh(Math.max(0, offset - 20))));
  $("historyNext").addEventListener("click", () => action(() => refresh(offset + 20)));
  connect();
  return {
    database, localize: render, refresh,
    async start() { await action(async () => { await client?.restore(); await refresh(); if (client?.user) $("accountSettings").open = false; }); },
    assertReady() { if (!client?.user) throw new Error(t("loginFirst")); },
    async submit(input, confirmed) {
      this.assertReady();
      try {
        const result = await client.submit(persistedTrade(input, confirmed));
        await refresh(0).catch(error => { if (!error.stale) message(errorText(error), true); });
        return result;
      } catch (error) {
        if (!error.stale) {
          if (error.savedTrade) await refresh().catch(() => {});
          error.message = errorText(error);
          message(error.message, true);
        }
        throw error;
      }
    },
    async profile() {
      this.assertReady();
      const records = await client.profileReports();
      const reports = records.filter(row => row.analysis_mode === $("profileSource").value);
      if (!reports.length) throw new Error(t("noReport"));
      return { user_id: client.user.user_id, reports: reports.map(row => row.result) };
    },
  };
}
