function executionTexts(language) {
  return language === "ko-KR" ? {
    title: "분할 매매 내역", buy: "매수", sell: "매도", stage: "차수", time: "체결 시간", price: "체결 가격", quantity: "수량", reason: "당시 이유 (선택)", source: "출처", remaining: "잔여 수량", pnl: "실현 손익", absent: "미기록", clear: "단일 거래로 다시 입력",
    average_buy_price: "매수 가중평균가", average_sell_price: "매도 가중평균가", total_bought: "총 매수 수량", total_sold: "총 매도 수량", remaining_quantity: "잔여 수량", remaining_average_cost: "잔여 평균 원가", realized_profit_loss: "실현 손익",
    note: "체결 순서에 따른 이동평균 원가 기준. 수수료·세금·환율 및 미실현 손익 제외. 시각은 기기 시간대 기준입니다. 일봉 배경은 최초 매수 전 데이터입니다.",
    invalid: "각 체결의 시각(시간대 포함), 양수 가격과 정수 수량을 확인하세요. 최대 100건, 누적 매수 1억 주까지 지원합니다.", duplicate: "중복 체결이 있습니다. 동일 스크린샷을 중복 선택했는지 확인하세요.", oversell: "당시 보유 수량보다 매도가 많습니다. 이전 매수를 추가하거나 시각·수량을 수정하세요. 공매도는 지원하지 않습니다.", noBuy: "최초 매수부터의 기록이 필요합니다.", occurrence: (n, side) => `${n}차 ${side === "buy" ? "매수" : "매도"}`,
    labels: { buyTime: "최초 매수 시간", sellTime: "최근 매도 시간", buyPrice: "매수 가중평균가", sellPrice: "매도 가중평균가", quantity: "총 매수 수량" },
  } : {
    title: "分批成交明细", buy: "买入", sell: "卖出", stage: "操作", time: "成交时间", price: "成交价格", quantity: "股数", reason: "当时理由（选填）", source: "来源", remaining: "剩余股数", pnl: "已实现盈亏", absent: "未记录", clear: "重新填写单笔交易",
    average_buy_price: "买入加权均价", average_sell_price: "卖出加权均价", total_bought: "累计买入股数", total_sold: "累计卖出股数", remaining_quantity: "剩余股数", remaining_average_cost: "剩余持仓均价", realized_profit_loss: "已实现盈亏",
    note: "按成交顺序、移动加权平均成本计算；未计手续费、税费、汇率和未实现盈亏。时间按本机时区显示。日 K 背景仅对应首次买入之前。",
    invalid: "请补全每笔成交的时间（含时区）、正数价格和整数股数。最多 100 笔，累计买入不超过 1 亿股。", duplicate: "存在重复成交，请检查是否重复选择了同一条记录。", oversell: "某次卖出超过当时的持仓，请补齐此前买入或修正时间、股数。暂不支持做空。", noBuy: "请提供从首次买入开始的完整记录。", occurrence: (n, side) => `第 ${n} 次${side === "buy" ? "买入" : "卖出"}`,
    labels: { buyTime: "首次买入时间", sellTime: "最近卖出时间", buyPrice: "买入加权均价", sellPrice: "卖出加权均价", quantity: "累计买入股数" },
  };
}

function executionPayload(rows) {
  return rows.map(({ execution_id, side, time, price, quantity, reason }) => ({ execution_id, side, time, price, quantity, reason: reason?.trim() || null }));
}

function summarizeExecutions(rows, language = "zh-CN") {
  const t = executionTexts(language);
  const fail = (key) => { throw new Error(t[key]); };
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) fail("invalid");
  const ids = new Set(), fingerprints = new Set();
  for (const row of rows) {
    if (!row.execution_id || !["buy", "sell"].includes(row.side) || !screenshotLocalTime(row.time) || !Number.isFinite(row.price) || row.price < 1e-8 || row.price > 1e12 || !Number.isInteger(row.quantity) || row.quantity <= 0 || row.quantity > 1e8) fail("invalid");
    const fingerprint = JSON.stringify([new Date(row.time).getTime(), row.side, row.price, row.quantity]);
    if (ids.has(row.execution_id) || fingerprints.has(fingerprint)) fail("duplicate");
    ids.add(row.execution_id); fingerprints.add(fingerprint);
  }
  let held = 0, cost = 0, bought = 0, sold = 0, buyAmount = 0, sellAmount = 0, realized = 0, soldCost = 0;
  const counts = { buy: 0, sell: 0 };
  const round = (n) => Number(n.toFixed(8));
  const timeline = [...rows].sort((a, b) => new Date(a.time) - new Date(b.time)).map((row) => {
    let profit = null;
    if (row.side === "buy") {
      held += row.quantity; cost += row.price * row.quantity;
      bought += row.quantity; buyAmount += row.price * row.quantity;
    } else {
      if (row.quantity > held) fail("oversell");
      const basis = cost * row.quantity / held;
      profit = row.price * row.quantity - basis;
      soldCost += basis; realized += profit; cost -= basis; held -= row.quantity;
      if (!held) cost = 0;
      sold += row.quantity; sellAmount += row.price * row.quantity;
    }
    return { ...row, occurrence: ++counts[row.side], remaining_quantity: held, realized_profit_loss: profit === null ? null : round(profit) };
  });
  if (!bought) fail("noBuy");
  if (bought > 1e8) fail("invalid");
  return {
    accounting_method: "moving_weighted_average_excluding_fees_taxes_fx",
    buy_count: counts.buy, sell_count: counts.sell, total_bought: bought, total_sold: sold, remaining_quantity: held,
    average_buy_price: round(buyAmount / bought), average_sell_price: sold ? round(sellAmount / sold) : null,
    remaining_cost_basis: round(cost), remaining_average_cost: held ? round(cost / held) : null,
    realized_profit_loss: sold ? round(realized) : null, realized_profit_loss_rate: sold ? round(realized / soldCost) : null, timeline,
  };
}

function executionTradeFields(summary) {
  const buys = summary.timeline.filter((row) => row.side === "buy");
  const sells = summary.timeline.filter((row) => row.side === "sell");
  return { buy_time: buys[0].time, sell_time: sells.length ? sells[sells.length - 1].time : null,
    buy_price: summary.average_buy_price, sell_price: summary.average_sell_price, quantity: summary.total_bought,
    profit_loss_amount: summary.realized_profit_loss, profit_loss_rate: summary.realized_profit_loss_rate };
}

function ledgerNode(parent, tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text; node.className = className; parent.append(node); return node;
}

function renderExecutionReport(host, summary, language) {
  host.replaceChildren();
  if (!summary) return;
  const t = executionTexts(language);
  const number = (value) => value == null ? "—" : value.toLocaleString(language, { maximumFractionDigits: 8 });
  ledgerNode(host, "h3", t.title);
  const metrics = ledgerNode(host, "dl", "", "execution-metrics");
  for (const key of ["average_buy_price", "average_sell_price", "total_bought", "total_sold", "remaining_quantity", "remaining_average_cost", "realized_profit_loss"]) {
    const group = ledgerNode(metrics, "div");
    ledgerNode(group, "dt", t[key]); ledgerNode(group, "dd", number(summary[key]));
  }
  const scroll = ledgerNode(host, "div", "", "execution-scroll");
  const table = ledgerNode(scroll, "table", "", "execution-table");
  const head = ledgerNode(ledgerNode(table, "thead"), "tr");
  for (const key of ["stage", "time", "price", "quantity", "remaining", "pnl", "reason"]) ledgerNode(head, "th", t[key]).scope = "col";
  const body = ledgerNode(table, "tbody");
  for (const row of summary.timeline) {
    const line = ledgerNode(body, "tr");
    for (const value of [t.occurrence(row.occurrence, row.side), new Date(row.time).toLocaleString(language), number(row.price), number(row.quantity), number(row.remaining_quantity), number(row.realized_profit_loss), row.reason || t.absent]) ledgerNode(line, "td", value);
  }
  ledgerNode(host, "p", t.note, "field-hint");
}

function renderExecutionEditor(host, rows, language, onChange, prefix) {
  host.replaceChildren();
  const t = executionTexts(language);
  const scroll = ledgerNode(host, "div", "", "execution-scroll");
  const table = ledgerNode(scroll, "table", "", "execution-table execution-editor");
  const head = ledgerNode(ledgerNode(table, "thead"), "tr");
  for (const key of ["source", "time", "price", "quantity", "reason"]) ledgerNode(head, "th", t[key]).scope = "col";
  const body = ledgerNode(table, "tbody");
  rows.forEach((row, index) => {
    const line = ledgerNode(body, "tr");
    ledgerNode(line, "th", `${index + 1}. ${t[row.side]}\n${row.source || ""}`).scope = "row";
    for (const key of ["time", "price", "quantity", "reason"]) {
      const input = ledgerNode(ledgerNode(line, "td"), key === "reason" ? "textarea" : "input");
      input.id = `${prefix}-${index}-${key}`;
      input.setAttribute("aria-label", `${index + 1}. ${t[row.side]} ${t[key]}`);
      if (key !== "reason") input.type = key === "time" ? "datetime-local" : "number";
      input.value = key === "time" ? screenshotLocalTime(row.time) : row[key] ?? "";
      if (key === "time") input.step = "1";
      if (key === "price" || key === "quantity") { input.min = key === "quantity" ? "1" : "0.00000001"; input.step = key === "quantity" ? "1" : "any"; }
      if (key === "reason") input.maxLength = 1000;
      // Incomplete OCR remains editable without discarding the pending merge.
      if (prefix === "review") input.dataset.screenshotControl = "true";
      input.addEventListener("input", () => {
        const value = input.value.trim();
        row[key] = key === "time" ? (value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null)
          : key === "reason" ? value || null : value ? Number(value) : null;
        onChange();
      });
    }
  });
}
