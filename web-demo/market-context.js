/* Historical context stays separate from the user's stated trading reasons. */
function createMarketContext({ getLanguage, getApiBase }) {
  const el = (id) => document.getElementById(id);
  const copy = {
    "zh-CN": {
      auto: "自动获取买入前日 K", source: "行情来源", live: "真实历史行情 · Yahoo", demo: "合成演示数据",
      fetch: "获取行情背景", loading: "正在读取历史日 K…", summary: "买入前行情摘要", manual: "补充背景（选填）",
      hint: "仅取纽约买入日期之前的日 K；不是盘中快照。", manualHint: "用户补充，未经行情源验证。",
      unsupported: "首版自动行情仅支持美股。可留空，继续按交易理由复盘。", failed: "行情读取失败。可重试，或关闭自动获取后继续复盘。",
      changed: "交易条件已变化，请重新获取行情。", invalid: "请先填写股票代码和有效的买入时间。",
      facts: "计算事实", book: "书籍参考 · 自行整理", rules: "按主题匹配 · 非模型生成", sourceLink: "查看原文", catalog: "版权与版本记录",
      rights: "目录标注原文在美国属公版；其他地区与现代译本需另行核实。", timezone: "交易时间采用本机时区：",
      metrics: ["最后收盘 · USD", "单日变化", "5 个交易日变化", "20 日收盘均值", "量 / 此前 20 日均量"], missing: "数据不足",
      manualPrefix: "[用户补充，未经验证] ", bars: "根日 K", synthetic: "合成演示 · 非真实行情",
    },
    "ko-KR": {
      auto: "매수 전 일봉 자동 조회", source: "시세 출처", live: "실제 과거 시세 · Yahoo", demo: "합성 데모 데이터",
      fetch: "시장 배경 조회", loading: "과거 일봉을 조회하는 중…", summary: "매수 전 시장 요약", manual: "추가 배경(선택)",
      hint: "뉴욕 매수일 이전 일봉만 사용하며 장중 스냅샷이 아닙니다.", manualHint: "사용자 입력이며 시세 공급원에서 검증하지 않았습니다.",
      unsupported: "첫 버전 자동 시세는 미국 시장만 지원합니다. 비워 두고 거래 이유로 복기할 수 있습니다.", failed: "시세 조회에 실패했습니다. 재시도하거나 자동 조회를 끈 뒤 복기하세요.",
      changed: "거래 조건이 변경되었습니다. 시세를 다시 조회하세요.", invalid: "종목 코드와 유효한 매수 시간을 먼저 입력하세요.",
      facts: "계산된 사실", book: "도서 참고 · 자체 요약", rules: "주제 기반 매칭 · 모델 생성 아님", sourceLink: "원문 보기", catalog: "저작권 및 판본 기록",
      rights: "목록상 원문은 미국에서 퍼블릭 도메인입니다. 다른 지역 및 현대 번역본은 별도 확인이 필요합니다.", timezone: "거래 시간은 기기 시간대 기준: ",
      metrics: ["마지막 종가 · USD", "전일 대비", "5거래일 변동", "20일 평균 종가", "거래량 / 직전 20일 평균"], missing: "자료 부족",
      manualPrefix: "[사용자 입력, 미검증] ", bars: "개 일봉", synthetic: "합성 데모 · 실제 시세 아님",
    },
  };
  let locale = getLanguage();
  let current = null;
  let revision = 0;
  let controller = null;
  let pending = null;
  const text = () => copy[getLanguage()];
  const enabled = () => el("autoMarket").checked && el("market").value === "US";
  const key = () => JSON.stringify([getApiBase(), getLanguage(), el("symbol").value.trim().toUpperCase(), el("buyTime").value, el("market").value, el("marketSource").value, el("buyReasonType").value]);
  function add(parent, tag, content, className = "") {
    const node = document.createElement(tag);
    node.textContent = content;
    node.className = className;
    parent.append(node);
    return node;
  }
  function status(message, error = false) {
    el("marketStatus").textContent = message;
    el("marketStatus").hidden = !message;
    el("marketStatus").dataset.error = String(error);
  }
  function invalidate() {
    revision++;
    controller?.abort();
    controller = null;
    pending = null;
    current = null;
    el("klineSummary").value = "";
    el("marketFacts").replaceChildren();
    el("marketFacts").hidden = true;
    status("");
    refreshControls();
  }
  function refreshControls() {
    const t = text();
    el("autoMarketLabel").textContent = t.auto;
    el("marketSourceLabel").textContent = t.source;
    el("marketSource").options[0].textContent = t.live;
    el("marketSource").options[1].textContent = t.demo;
    el("fetchMarket").textContent = pending ? t.loading : t.fetch;
    el("fetchMarket").disabled = !enabled() || Boolean(pending);
    el("marketSource").disabled = !enabled();
    el("klineSummary").readOnly = enabled();
    document.querySelector('label[for="klineSummary"]').textContent = enabled() ? t.summary : t.manual;
    el("klineHint").textContent = el("market").value !== "US" ? t.unsupported : enabled() ? t.hint : t.manualHint;
    el("timeZoneHint").textContent = t.timezone + Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  function render(result) {
    const t = text();
    el("klineSummary").value = result.kline_summary;
    const host = el("marketFacts");
    host.replaceChildren();
    host.hidden = false;
    add(host, "h3", t.facts);
    add(host, "p", `${result.source === "demo" ? t.synthetic : result.provider} · ${result.symbol} · ${result.bar_count} ${t.bars}`, "market-provenance");
    add(host, "p", `${result.data_start} ~ ${result.data_end} · ${result.exchange_timezone}`, "field-hint");
    const metrics = add(host, "dl", "", "market-metrics");
    const values = [result.metrics.last_close, result.metrics.daily_change_pct, result.metrics.five_session_change_pct, result.metrics.sma20, result.metrics.volume_vs_previous20];
    values.forEach((value, i) => {
      add(metrics, "dt", t.metrics[i]);
      add(metrics, "dd", value == null ? t.missing : `${value.toFixed(2)}${i === 1 || i === 2 ? "%" : i === 4 ? "x" : ""}`);
    });
    for (const warning of result.warnings || []) add(host, "p", warning, "field-hint");
    add(host, "h3", t.book);
    add(host, "p", t.rules, "field-hint");
    for (const note of result.book_notes) {
      const item = add(host, "article", "", "book-note");
      add(item, "strong", note.title);
      add(item, "p", note.content);
      add(item, "p", note.reflection_question, "book-question");
      add(item, "p", `${note.author} · ${note.book} (${note.publication_year}) · ${note.chapter}`, "field-hint");
      // Only the reviewed public-domain source is linked, never arbitrary API URLs.
      if (note.source_url === "https://www.gutenberg.org/files/75570/75570-h/75570-h.htm") {
        const link = add(item, "a", t.sourceLink);
        link.href = note.source_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }
    add(host, "p", t.rights, "field-hint");
    const catalog = add(host, "a", t.catalog);
    catalog.href = "https://www.gutenberg.org/ebooks/75570";
    catalog.target = "_blank";
    catalog.rel = "noopener noreferrer";
  }
  async function ensure() {
    if (!enabled()) return null;
    const requestKey = key();
    if (current?.key === requestKey) return current.result;
    if (pending?.key === requestKey) return pending.promise;
    const asOf = new Date(el("buyTime").value);
    if (!Number.isFinite(asOf.getTime()) || !el("symbol").value.trim()) throw new Error(text().invalid);
    const request = {
      symbol: el("symbol").value.trim(), market: "US", as_of: asOf.toISOString(),
      language: getLanguage(), source: el("marketSource").value,
      focus: el("buyReasonType").value === "fear_of_missing_out" ? "fear_of_missing_out" : "general",
    };
    controller = new AbortController();
    const activeController = controller;
    const generation = revision;
    const timer = setTimeout(() => activeController.abort(), 45000);
    status(text().loading);
    const promise = (async () => {
      try {
        const response = await fetch(`${getApiBase()}/analyze-market-context`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: activeController.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          const detail = result.detail;
          throw new Error(typeof detail === "string" ? detail : detail?.message || text().failed);
        }
        if (revision !== generation || key() !== requestKey) throw new Error(text().changed);
        current = { key: requestKey, result };
        render(result);
        status("");
        return result;
      } catch (error) {
        const message = revision !== generation ? text().changed : error.name === "AbortError" || error instanceof TypeError ? text().failed : error.message;
        if (revision === generation) status(message, true);
        throw new Error(message);
      } finally {
        clearTimeout(timer);
        if (revision === generation) {
          pending = null;
          controller = null;
          refreshControls();
        }
      }
    })();
    pending = { key: requestKey, promise };
    refreshControls();
    return promise;
  }
  ["symbol", "buyTime"].forEach((id) => el(id).addEventListener("input", invalidate));
  ["market", "marketSource", "buyReasonType", "autoMarket", "apiUrl"].forEach((id) => el(id).addEventListener("change", invalidate));
  el("fetchMarket").addEventListener("click", () => ensure().catch((error) => status(error.message, true)));
  refreshControls();
  return {
    ensure, invalidate,
    useDemo() { el("marketSource").value = "demo"; invalidate(); },
    useLive() { el("marketSource").value = "yahoo"; invalidate(); },
    localize() {
      if (locale !== getLanguage()) { locale = getLanguage(); invalidate(); }
      refreshControls();
    },
    requestFields() {
      if (enabled()) return current?.key === key() ? { market_snapshot: { kline_summary: current.result.kline_summary }, rag_context: current.result.rag_context } : { market_snapshot: {}, rag_context: [] };
      const manual = el("klineSummary").value.trim();
      return { market_snapshot: { kline_summary: manual ? text().manualPrefix + manual.slice(0, 1900) : null }, rag_context: [] };
    },
  };
}
