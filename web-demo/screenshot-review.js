const screenshotFieldNames = ["symbol", "market", "buy_time", "sell_time", "buy_price", "sell_price", "quantity", "buy_reason", "sell_reason"];

function screenshotLocalTime(value) {
  // A date or a timezone-free time cannot establish an exact trading instant.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}

function createScreenshotReview({ getLanguage, getApiBase, onApply }) {
  const el = (id) => document.getElementById(id);
  const copy = {
    "zh-CN": {
      recognize: "识别待处理图片", title: "待核对的识别结果", confirm: "确认并替换表单", cancel: "取消", remove: "移除当前图片",
      stop: "停止识别", clear: "清空图片", stopped: "已停止，已完成的结果仍保留。", limit: "最多选择 10 张图片，合计不超过 32 MB；原图片列表未改变。",
      queued: "请先识别当前图片，或移除图片后手动分析。", progress: (done, total) => `已处理 ${done} / ${total} 张`,
      states: { queued: "待识别", reading: "识别中", ready: "待核对", cashFlow: "资金流水", unclassified: "类型不明", error: "识别失败", applied: "已填入", cancelled: "已取消" },
      columns: ["字段", "截图内容", "模型自评分"],
      fields: ["股票代码", "市场", "买入时间", "卖出时间", "买入价格", "卖出价格", "股数", "买入理由", "卖出理由"],
      missing: "未识别", review: "待核对", score: "自评分不是准确率。缺失字段不会沿用原表单内容。",
      time: "时间缺少时刻或时区，暂不填入。请在表单中按本机时区补充真实时间。",
      pending: "请先确认或取消截图识别结果，再分析交易。", busy: "截图识别中，请等待或移除图片后再分析。",
      reading: "正在识别截图…", failed: "截图识别失败，请重试或手动输入。", timeout: "识别超时，请重试。",
      mock: "当前为 Mock 模式，没有执行真实截图识别；原表单未改变。",
      empty: "没有可靠的交易字段，原表单未改变。请裁剪到一笔交易后重试或手动输入。",
      cashFlow: "识别为资金流水（利息、分红或入出金），未导入股票买卖。请换用买入/卖出成交明细，或移除图片后手动填写。",
      unclassified: "暂时无法确认股票买卖成交及方向，原表单未改变。请换用明确的成交明细，或移除图片后手动填写。",
      originalType: "截图交易类型：", buyOnly: "这张图仅记录买入，卖出字段保持空白；未卖出时可保留为空。",
      sellOnly: "这张图仅记录卖出。分析前请补充对应买入记录，不要把其他买入自动配到这笔卖出。",
      applied: "已填入确认的字段，请补全空白项和交易理由。", cancelled: "已取消识别结果，原表单未改变。",
      changed: "表单已修改，旧识别结果已取消。", large: "图片超过 8 MB。", invalid: "请选择 PNG、JPG 或 WebP 图片。",
      errors: { 413: "图片超过 8 MB。", 415: "图片格式无效，请使用 PNG、JPG 或 WebP。", 422: "上传参数无效。", 503: "真实 AI 尚未配置，请先在后端配置 API 密钥。" },
    },
    "ko-KR": {
      recognize: "미처리 이미지 인식", title: "확인할 인식 결과", confirm: "확인 후 입력란 교체", cancel: "취소", remove: "현재 이미지 제거",
      stop: "인식 중지", clear: "이미지 비우기", stopped: "중지했습니다. 완료된 결과는 유지됩니다.", limit: "최대 10장, 합계 32MB까지 선택할 수 있습니다. 기존 이미지 목록은 유지됩니다.",
      queued: "현재 이미지를 인식하거나 제거한 뒤 직접 분석하세요.", progress: (done, total) => `${done} / ${total}장 처리됨`,
      states: { queued: "인식 대기", reading: "인식 중", ready: "확인 필요", cashFlow: "자금 내역", unclassified: "종류 불명", error: "인식 실패", applied: "입력 완료", cancelled: "취소됨" },
      columns: ["항목", "스크린샷 내용", "모델 자체 점수"],
      fields: ["종목 코드", "시장", "매수 시간", "매도 시간", "매수 가격", "매도 가격", "수량", "매수 이유", "매도 이유"],
      missing: "미인식", review: "확인 필요", score: "자체 점수는 정확도가 아닙니다. 누락된 항목은 기존 입력값을 사용하지 않습니다.",
      time: "시각 또는 시간대가 없어 시간을 입력하지 않았습니다. 기기의 시간대를 기준으로 실제 시간을 입력하세요.",
      pending: "인식 결과를 확인하거나 취소한 뒤 거래를 분석하세요.", busy: "인식 중입니다. 기다리거나 이미지를 제거한 뒤 분석하세요.",
      reading: "스크린샷을 인식하는 중…", failed: "인식에 실패했습니다. 다시 시도하거나 직접 입력하세요.", timeout: "인식 시간이 초과되었습니다. 다시 시도하세요.",
      mock: "Mock 모드에서는 실제 이미지 인식을 수행하지 않습니다. 기존 입력값은 그대로 유지됩니다.",
      empty: "명확한 거래 정보가 없습니다. 기존 입력값은 유지됩니다. 한 거래만 보이도록 잘라서 다시 시도하거나 직접 입력하세요.",
      cashFlow: "이자·배당·입출금 등의 자금 내역으로 인식되어 주식 매매에 반영하지 않았습니다. 매수/매도 체결 내역으로 바꾸거나 이미지를 제거한 뒤 직접 입력하세요.",
      unclassified: "주식 체결 여부와 매매 방향을 확인할 수 없어 기존 입력값을 유지합니다. 명확한 체결 내역으로 바꾸거나 이미지를 제거한 뒤 직접 입력하세요.",
      originalType: "스크린샷 거래 종류: ", buyOnly: "매수만 기록된 이미지입니다. 매도 항목은 비워 둡니다. 아직 매도하지 않았다면 그대로 두세요.",
      sellOnly: "매도만 기록된 이미지입니다. 분석 전에 해당 매수 기록을 보완하세요. 다른 매수를 임의로 연결하지 마세요.",
      applied: "확인한 항목을 입력했습니다. 빈 항목과 매매 이유를 보완하세요.", cancelled: "인식 결과를 취소했습니다. 기존 입력값은 유지됩니다.",
      changed: "입력값이 변경되어 이전 인식 결과를 취소했습니다.", large: "이미지가 8MB를 초과합니다.", invalid: "PNG, JPG 또는 WebP 이미지를 선택하세요.",
      errors: { 413: "이미지가 8MB를 초과합니다.", 415: "올바른 PNG, JPG 또는 WebP 이미지를 선택하세요.", 422: "업로드 정보가 올바르지 않습니다.", 503: "실제 AI가 설정되지 않았습니다. 서버의 API 키를 설정하세요." },
    },
  };
  const text = () => copy[getLanguage()];
  let locale = getLanguage();
  let generation = 0;
  let controller = null;
  let running = false;
  let items = [];
  let selected = null;
  let draft = null;
  let statusKey = "";
  let statusError = false;

  function status(key, error = false) {
    statusKey = key;
    statusError = error;
    const label = selected?.result?.record?.label;
    const message = key.startsWith("http") ? text().errors[key.slice(4)] : text()[key];
    el("ocrStatus").textContent = (message || "") + (key && typeof label === "string" && label ? `\n${text().originalType}${label}` : "");
    el("ocrStatus").dataset.state = error ? "error" : "info";
    el("ocrStatus").hidden = !key;
  }
  function controls() {
    el("recognizeScreenshot").textContent = text().recognize;
    el("recognizeScreenshot").disabled = running || !items.some((item) => ["queued", "error"].includes(item.state));
    el("stopScreenshots").textContent = text().stop;
    el("stopScreenshots").hidden = !running;
    el("clearScreenshots").textContent = text().clear;
    el("clearScreenshots").hidden = !items.length;
    el("confirmScreenshot").textContent = text().confirm;
    el("confirmScreenshot").disabled = running;
    el("cancelScreenshot").textContent = text().cancel;
    el("removeScreenshot").textContent = text().remove;
    el("screenshotReviewTitle").textContent = text().title;
    el("screenshotReview").hidden = !draft;
  }
  function stop() {
    generation++;
    controller?.abort();
    controller = null;
    running = false;
    for (const item of items) if (item.state === "reading") item.state = "queued";
  }
  function clear() {
    stop();
    for (const item of items) URL.revokeObjectURL(item.url);
    items = [];
    selected = null;
    draft = null;
    el("screenshotFile").value = "";
    refresh();
  }
  function add(parent, tag, content) {
    const node = document.createElement(tag);
    node.textContent = content;
    parent.append(node);
    return node;
  }
  function render() {
    const heads = el("screenshotReviewHead");
    heads.replaceChildren();
    text().columns.forEach((label) => { add(heads, "th", label).scope = "col"; });
    const rows = el("screenshotReviewRows");
    rows.replaceChildren();
    const warnings = el("screenshotReviewWarnings");
    warnings.replaceChildren();
    if (!draft) return;
    if (draft.record?.label) add(warnings, "p", text().originalType + draft.record.label);
    if (draft.record?.side === "buy") add(warnings, "p", text().buyOnly);
    if (draft.record?.side === "sell") add(warnings, "p", text().sellOnly);
    screenshotFieldNames.forEach((key, index) => {
      const value = draft.fields[key];
      const confidence = draft.field_confidence?.[key];
      const scoreKnown = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
      const missing = value == null || value === "";
      const row = add(rows, "tr", "");
      row.dataset.review = String(missing || !scoreKnown || confidence < 0.8);
      add(row, "th", text().fields[index]).scope = "row";
      add(row, "td", missing ? text().missing : String(value));
      add(row, "td", missing || !scoreKnown ? text().review : `${Math.round(confidence * 100)}%${confidence < 0.8 ? ` · ${text().review}` : ""}`);
    });
    add(warnings, "p", text().score);
    if (["buy_time", "sell_time"].some((key) => draft.fields[key] && !screenshotLocalTime(draft.fields[key]))) add(warnings, "p", text().time);
    for (const message of [draft.notice, ...(draft.warnings || [])]) {
      if (typeof message === "string" && message) add(warnings, "p", message);
    }
  }
  function refresh() {
    draft = selected?.state === "ready" ? selected.result : null;
    const queue = el("screenshotQueue");
    queue.replaceChildren();
    queue.hidden = !items.length;
    for (const item of items) {
      const row = add(queue, "li", "");
      const button = add(row, "button", "");
      button.type = "button";
      button.className = "screenshot-item";
      button.setAttribute("aria-pressed", String(item === selected));
      add(button, "span", item.file.name).className = "screenshot-name";
      add(button, "span", text().states[item.state]).className = "screenshot-state";
      button.addEventListener("click", () => {
        selected = item;
        if (item.state === "cancelled") item.state = "ready";
        refresh();
      });
    }
    const complete = items.filter((item) => !["queued", "reading"].includes(item.state)).length;
    el("screenshotProgress").textContent = text().progress(complete, items.length);
    el("screenshotProgress").hidden = !items.length;
    el("uploadPreview").hidden = !selected;
    if (selected) {
      el("screenshotPreview").src = selected.url;
      el("screenshotPreview").alt = selected.file.name;
      el("uploadMeta").textContent = `${selected.file.name} · ${(selected.file.size / 1024 / 1024).toFixed(2)} MB`;
    } else {
      el("screenshotPreview").removeAttribute("src");
      el("uploadMeta").textContent = "";
    }
    status(selected?.state === "error" ? selected.errorKey : selected?.state === "ready" ? "" : selected?.state || "", selected?.state === "error");
    controls();
    render();
  }
  function selectFiles() {
    const files = Array.from(el("screenshotFile").files);
    // Reset the picker so the same selection can be chosen again after removal.
    el("screenshotFile").value = "";
    if (!files.length) return;
    let error = "";
    if (files.length > 10 || files.reduce((total, file) => total + file.size, 0) > 32 * 1024 * 1024) error = "limit";
    else if (files.some((file) => file.size > 8 * 1024 * 1024)) error = "large";
    else if (files.some((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type))) error = "invalid";
    if (error) return status(error, true);
    clear();
    items = files.map((file) => ({ file, url: URL.createObjectURL(file), state: "queued", result: null, errorKey: "" }));
    selected = items[0];
    refresh();
  }
  async function recognize() {
    if (running) return;
    const pending = items.filter((item) => ["queued", "error"].includes(item.state));
    if (!pending.length) return;
    const revision = ++generation;
    const api = getApiBase();
    const language = getLanguage();
    const isCurrent = () => revision === generation && api === getApiBase() && language === getLanguage();
    running = true;
    for (const item of pending) {
      if (!isCurrent()) break;
      const active = new AbortController();
      controller = active;
      const timer = setTimeout(() => active.abort(), 120000);
      item.state = "reading";
      item.errorKey = "";
      refresh();
      try {
        const form = new FormData();
        form.append("file", item.file);
        form.append("language", language);
        const response = await fetch(`${api}/recognize-trade-screenshot`, { method: "POST", body: form, signal: active.signal });
        if (!isCurrent()) break;
        if (!response.ok) {
          item.state = "error";
          item.errorKey = text().errors[response.status] ? `http${response.status}` : "failed";
          // Configuration/rate-limit failures would also affect every remaining image.
          if ([401, 403, 429, 503].includes(response.status)) break;
          continue;
        }
        const result = await response.json();
        if (!isCurrent()) break;
        if (result.status === "mock") { item.state = "error"; item.errorKey = "mock"; break; }
        item.result = result;
        if (result.status === "not_trade" || result.record?.kind === "cash_flow") item.state = "cashFlow";
        else if (result.record?.kind !== "security_trade" || !["buy", "sell", "round_trip"].includes(result.record?.side)) item.state = "unclassified";
        else if (result.status !== "recognized" || !screenshotFieldNames.some((key) => result.fields?.[key] != null && result.fields[key] !== "")) {
          item.state = "error";
          item.errorKey = "empty";
        } else item.state = "ready";
      } catch (error) {
        if (isCurrent()) { item.state = "error"; item.errorKey = error.name === "AbortError" ? "timeout" : "failed"; }
      } finally {
        clearTimeout(timer);
        if (isCurrent()) { controller = null; refresh(); }
      }
    }
    if (isCurrent()) { running = false; refresh(); }
  }
  el("screenshotFile").addEventListener("change", selectFiles);
  el("recognizeScreenshot").addEventListener("click", recognize);
  el("stopScreenshots").addEventListener("click", () => { stop(); refresh(); status("stopped"); });
  el("clearScreenshots").addEventListener("click", clear);
  el("removeScreenshot").addEventListener("click", () => {
    if (!selected) return;
    stop();
    const index = items.indexOf(selected);
    URL.revokeObjectURL(selected.url);
    items.splice(index, 1);
    selected = items[Math.min(index, items.length - 1)] || null;
    refresh();
  });
  el("cancelScreenshot").addEventListener("click", () => {
    if (!draft) return;
    selected.state = "cancelled";
    refresh();
  });
  el("confirmScreenshot").addEventListener("click", () => {
    if (!draft || running) return;
    const result = draft;
    // Only one record owns the form; previously applied records need confirmation again.
    for (const item of items) if (item.state === "applied") item.state = "ready";
    selected.state = "applied";
    refresh();
    onApply(result);
  });
  function resetResults() {
    stop();
    for (const item of items) { item.state = "queued"; item.result = null; item.errorKey = ""; }
    refresh();
  }
  el("apiUrl").addEventListener("input", resetResults);
  el("apiUrl").addEventListener("change", resetResults);
  for (const event of ["input", "change"]) el("tradeForm").addEventListener(event, (event) => {
    if (event.target.id !== "screenshotFile" && (running || draft)) {
      stop();
      if (selected?.state === "ready") selected.state = "cancelled";
      refresh();
      status("changed");
    }
  });
  controls();
  return {
    clear,
    assertReady() {
      if (running || draft) throw new Error(running ? text().busy : text().pending);
      if (["cashFlow", "unclassified", "queued", "error"].includes(selected?.state)) {
        const key = selected.state === "error" ? selected.errorKey : selected.state;
        throw new Error(key.startsWith("http") ? text().errors[key.slice(4)] : text()[key]);
      }
    },
    localize() {
      if (locale !== getLanguage()) {
        locale = getLanguage();
        stop();
        refresh();
      }
      else { controls(); render(); status(statusKey, statusError); }
    },
  };
}
