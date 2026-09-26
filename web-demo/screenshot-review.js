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
      recognize: "识别截图", title: "待核对的识别结果", confirm: "确认并替换表单", cancel: "取消", remove: "移除图片",
      columns: ["字段", "截图内容", "模型自评分"],
      fields: ["股票代码", "市场", "买入时间", "卖出时间", "买入价格", "卖出价格", "股数", "买入理由", "卖出理由"],
      missing: "未识别", review: "待核对", score: "自评分不是准确率。缺失字段不会沿用原表单内容。",
      time: "时间缺少时刻或时区，暂不填入。请在表单中按本机时区补充真实时间。",
      pending: "请先确认或取消截图识别结果，再分析交易。", busy: "截图识别中，请等待或移除图片后再分析。",
      reading: "正在识别截图…", failed: "截图识别失败，请重试或手动输入。", timeout: "识别超时，请重试。",
      mock: "当前为 Mock 模式，没有执行真实截图识别；原表单未改变。",
      empty: "没有可靠的交易字段，原表单未改变。请裁剪到一笔交易后重试或手动输入。",
      applied: "已填入确认的字段，请补全空白项和交易理由。", cancelled: "已取消识别结果，原表单未改变。",
      changed: "表单已修改，旧识别结果已取消。", large: "图片超过 8 MB。", invalid: "请选择 PNG、JPG 或 WebP 图片。",
      errors: { 413: "图片超过 8 MB。", 415: "图片格式无效，请使用 PNG、JPG 或 WebP。", 422: "上传参数无效。", 503: "真实 AI 尚未配置，请先在后端配置 API 密钥。" },
    },
    "ko-KR": {
      recognize: "스크린샷 인식", title: "확인할 인식 결과", confirm: "확인 후 입력란 교체", cancel: "취소", remove: "이미지 제거",
      columns: ["항목", "스크린샷 내용", "모델 자체 점수"],
      fields: ["종목 코드", "시장", "매수 시간", "매도 시간", "매수 가격", "매도 가격", "수량", "매수 이유", "매도 이유"],
      missing: "미인식", review: "확인 필요", score: "자체 점수는 정확도가 아닙니다. 누락된 항목은 기존 입력값을 사용하지 않습니다.",
      time: "시각 또는 시간대가 없어 시간을 입력하지 않았습니다. 기기의 시간대를 기준으로 실제 시간을 입력하세요.",
      pending: "인식 결과를 확인하거나 취소한 뒤 거래를 분석하세요.", busy: "인식 중입니다. 기다리거나 이미지를 제거한 뒤 분석하세요.",
      reading: "스크린샷을 인식하는 중…", failed: "인식에 실패했습니다. 다시 시도하거나 직접 입력하세요.", timeout: "인식 시간이 초과되었습니다. 다시 시도하세요.",
      mock: "Mock 모드에서는 실제 이미지 인식을 수행하지 않습니다. 기존 입력값은 그대로 유지됩니다.",
      empty: "명확한 거래 정보가 없습니다. 기존 입력값은 유지됩니다. 한 거래만 보이도록 잘라서 다시 시도하거나 직접 입력하세요.",
      applied: "확인한 항목을 입력했습니다. 빈 항목과 매매 이유를 보완하세요.", cancelled: "인식 결과를 취소했습니다. 기존 입력값은 유지됩니다.",
      changed: "입력값이 변경되어 이전 인식 결과를 취소했습니다.", large: "이미지가 8MB를 초과합니다.", invalid: "PNG, JPG 또는 WebP 이미지를 선택하세요.",
      errors: { 413: "이미지가 8MB를 초과합니다.", 415: "올바른 PNG, JPG 또는 WebP 이미지를 선택하세요.", 422: "업로드 정보가 올바르지 않습니다.", 503: "실제 AI가 설정되지 않았습니다. 서버의 API 키를 설정하세요." },
    },
  };
  const text = () => copy[getLanguage()];
  let locale = getLanguage();
  let generation = 0;
  let controller = null;
  let draft = null;
  let previewUrl = null;
  let statusKey = "";
  let statusError = false;

  function status(key, error = false) {
    statusKey = key;
    statusError = error;
    el("ocrStatus").textContent = text()[key] || "";
    el("ocrStatus").dataset.state = error ? "error" : "info";
    el("ocrStatus").hidden = !key;
  }
  function controls() {
    el("recognizeScreenshot").textContent = controller ? text().reading : text().recognize;
    el("recognizeScreenshot").disabled = Boolean(controller) || !el("screenshotFile").files[0];
    el("confirmScreenshot").textContent = text().confirm;
    el("cancelScreenshot").textContent = text().cancel;
    el("removeScreenshot").textContent = text().remove;
    el("screenshotReviewTitle").textContent = text().title;
    el("screenshotReview").hidden = !draft;
  }
  function invalidate(key = "") {
    generation++;
    controller?.abort();
    controller = null;
    draft = null;
    el("screenshotReviewRows").replaceChildren();
    el("screenshotReviewWarnings").replaceChildren();
    status(key);
    controls();
  }
  function clear() {
    el("screenshotFile").value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    el("screenshotPreview").removeAttribute("src");
    el("uploadPreview").hidden = true;
    el("uploadMeta").textContent = "";
    invalidate();
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
  function selectFile() {
    invalidate();
    const file = el("screenshotFile").files[0];
    if (!file) return clear();
    if (file.size > 8 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      const key = file.size > 8 * 1024 * 1024 ? "large" : "invalid";
      clear();
      status(key, true);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    el("screenshotPreview").src = previewUrl;
    el("screenshotPreview").alt = file.name;
    el("uploadPreview").hidden = false;
    el("uploadMeta").textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  }
  async function recognize() {
    const file = el("screenshotFile").files[0];
    if (!file || controller) return;
    invalidate();
    const revision = generation;
    const api = getApiBase();
    const language = getLanguage();
    const active = new AbortController();
    controller = active;
    const timer = setTimeout(() => active.abort(), 120000);
    const isCurrent = () => revision === generation && api === getApiBase() && language === getLanguage() && file === el("screenshotFile").files[0];
    status("reading");
    controls();
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("language", language);
      const response = await fetch(`${api}/recognize-trade-screenshot`, { method: "POST", body: form, signal: active.signal });
      if (!isCurrent()) return;
      if (!response.ok) {
        const key = text().errors[response.status] ? `http${response.status}` : "failed";
        statusKey = key;
        statusError = true;
        el("ocrStatus").textContent = text().errors[response.status] || text().failed;
        el("ocrStatus").dataset.state = "error";
        return;
      }
      const result = await response.json();
      if (!isCurrent()) return;
      if (result.status === "mock") return status("mock", true);
      if (result.status !== "recognized" || !screenshotFieldNames.some((key) => result.fields?.[key] != null && result.fields[key] !== "")) return status("empty", true);
      draft = result;
      status("");
      render();
    } catch (error) {
      if (isCurrent()) status(error.name === "AbortError" ? "timeout" : "failed", true);
    } finally {
      clearTimeout(timer);
      if (revision === generation) { controller = null; controls(); }
    }
  }
  el("screenshotFile").addEventListener("change", selectFile);
  el("recognizeScreenshot").addEventListener("click", recognize);
  el("removeScreenshot").addEventListener("click", clear);
  el("cancelScreenshot").addEventListener("click", () => invalidate("cancelled"));
  el("confirmScreenshot").addEventListener("click", () => {
    if (!draft) return;
    const result = draft;
    invalidate("applied");
    onApply(result);
  });
  el("apiUrl").addEventListener("input", () => invalidate());
  el("apiUrl").addEventListener("change", () => invalidate());
  for (const event of ["input", "change"]) el("tradeForm").addEventListener(event, (event) => {
    if (event.target.id !== "screenshotFile" && (controller || draft)) invalidate("changed");
  });
  controls();
  return {
    clear,
    assertReady() { if (controller || draft) throw new Error(controller ? text().busy : text().pending); },
    localize() {
      if (locale !== getLanguage()) { locale = getLanguage(); invalidate(); }
      else if (statusKey.startsWith("http")) el("ocrStatus").textContent = text().errors[statusKey.slice(4)];
      else status(statusKey, statusError);
      controls();
      render();
    },
  };
}

