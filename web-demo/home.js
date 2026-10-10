(() => {
  const copy = {
    "zh-CN": {
      brandName:"AI 投资教练",tagline:"投资决策训练场",navMarket:"行情与交易",navReview:"AI 交易复盘",checking:"正在检查后端",backend:"Young 后端已连接",demoMode:"本地演示模式",
      eyebrow:"PAPER TRADING · DEMO",headline:"用模拟交易练习更好的决策",subhead:"查看示例行情，记录买卖理由，并在交易后进入 AI 复盘。",demoNotice:"演示行情与资金为模拟数据，不代表真实市场或可用资金",
      selectStock:"选择股票",demoQuote:"模拟参考价",mockMarket:"合成演示行情",mockMarketNote:"K 线由本地示例数据生成，非实时行情",chartTitle:"价格走势",dailyBars:"日线 · 示例",upDay:"上涨",downDay:"下跌",chartWarning:"仅用于网页演示。接入行情服务前请勿视作真实历史数据。",
      orderTitle:"模拟下单",orderSub:"以当前示例价记录一笔模拟成交",paperTag:"模拟账户",buy:"买入",sell:"卖出",symbol:"股票代码",price:"成交价格",quantity:"数量",reason:"交易理由（选填）",reasonPlaceholder:"写下当时的理由，复盘时可供参考",estimatedAmount:"预计金额",confirmBuy:"确认买入",confirmSell:"确认卖出",invalidQuantity:"请输入正整数股数。",invalidPrice:"请输入大于 0 的成交价格。",notEnoughCash:"可用模拟资金不足。",notEnoughShares:"持仓数量不足，不能卖出超过持有数量的股票。",savedBackend:"成交已交给 Young 后端保存。",savedDemo:"后端接口暂不可用，成交已保存在本机的演示记录中。",backendFailed:"Young 后端保存失败；本笔成交仅保存在本机演示记录中。",startingCash:"模拟账户初始资金",availableCash:"可用模拟资金",positionsValue:"持仓市值（按示例价）",realizedPnl:"已实现盈亏",positionsTitle:"我的持仓",positionsSub:"持仓成本与盈亏由模拟成交记录计算",thStock:"股票",thQuantity:"持有数量",thAverage:"持仓均价",thLast:"模拟参考价",thMarketValue:"市值",thUnrealized:"浮动盈亏",positionsEmpty:"还没有持仓。选择股票并下第一笔模拟订单。",reviewPosition:"AI 复盘",tradesTitle:"成交记录",tradesSub:"后端可用时提交至 Young 业务接口；否则标记为本机演示",clearDemo:"重置本机账户",thTime:"时间",thSide:"方向",thPrice:"价格",thAmount:"金额",thSaved:"保存状态",tradesEmpty:"完成模拟买入或卖出后，成交会显示在这里。",backendSaved:"后端已保存",localSaved:"本机演示",reviewTrade:"复盘这笔交易",disclaimer:"本页面为教学演示，不构成投资建议；所有行情与资金均为虚构示例。",confirmClear:"确定清空浏览器中的账户记录？此操作不会删除 Young 后端已保存的交易；清空后网页无法从后端恢复列表。",cleared:"浏览器中的账户记录已清空。",chartLabel:"合成示例 K 线图",candles:"根日线",marketTrend:"模拟变化",shareUnit:"股",averageUnit:"股",marketUnavailable:"演示模式：行情与账户均为本地合成数据。",
      stocks:{AAPL:"苹果",NVDA:"英伟达",TSLA:"特斯拉"},markets:{US:"美国市场"},currency:"USD",langButton:"한국어",reasonCodes:{"":null}
    },
    "ko-KR": {
      brandName:"AI 투자 코치",tagline:"투자 의사결정 연습 공간",navMarket:"시세 및 거래",navReview:"AI 거래 복기",checking:"백엔드 확인 중",backend:"Young 백엔드 연결됨",demoMode:"로컬 데모 모드",
      eyebrow:"PAPER TRADING · DEMO",headline:"모의 거래로 더 나은 결정을 연습하세요",subhead:"예시 시세를 보고 매매 이유를 기록한 뒤 AI 복기를 시작하세요.",demoNotice:"시세와 자금은 데모용이며 실제 시장 가격이나 사용 가능한 자금이 아닙니다.",
      selectStock:"종목 선택",demoQuote:"모의 참고 가격",mockMarket:"합성 데모 시세",mockMarketNote:"캔들 차트는 로컬 예시 데이터이며 실시간 시세가 아닙니다",chartTitle:"가격 흐름",dailyBars:"일봉 · 예시",upDay:"상승",downDay:"하락",chartWarning:"웹 데모 전용입니다. 시세 서비스 연결 전까지 실제 과거 데이터로 보지 마세요.",
      orderTitle:"모의 주문",orderSub:"현재 예시 가격으로 모의 체결을 기록합니다",paperTag:"모의 계정",buy:"매수",sell:"매도",symbol:"종목 코드",price:"체결 가격",quantity:"수량",reason:"거래 이유 (선택)",reasonPlaceholder:"당시 이유를 적어 두면 복기에 참고할 수 있습니다",estimatedAmount:"예상 금액",confirmBuy:"매수 확인",confirmSell:"매도 확인",invalidQuantity:"양의 정수 수량을 입력하세요.",invalidPrice:"0보다 큰 체결 가격을 입력하세요.",notEnoughCash:"사용 가능한 모의 자금이 부족합니다.",notEnoughShares:"보유 수량보다 많이 매도할 수 없습니다.",savedBackend:"거래를 Young 백엔드에 저장했습니다.",savedDemo:"백엔드 API를 사용할 수 없어 거래를 이 브라우저의 데모 기록에 저장했습니다.",backendFailed:"Young 백엔드 저장에 실패했습니다. 이 거래는 브라우저 데모 기록에만 저장됩니다.",startingCash:"모의 계정 시작 자금",availableCash:"사용 가능한 모의 자금",positionsValue:"보유 평가액 (예시가 기준)",realizedPnl:"실현 손익",positionsTitle:"내 보유 종목",positionsSub:"보유 원가와 손익은 모의 체결 기록으로 계산합니다",thStock:"종목",thQuantity:"보유 수량",thAverage:"평균 매입가",thLast:"모의 참고가",thMarketValue:"평가액",thUnrealized:"평가 손익",positionsEmpty:"보유 종목이 없습니다. 종목을 선택하고 첫 모의 주문을 해 보세요.",reviewPosition:"AI 복기",tradesTitle:"체결 기록",tradesSub:"백엔드 연결 시 Young API로 전송하고, 아니면 로컬 데모로 표시합니다",clearDemo:"브라우저 계정 초기화",thTime:"시간",thSide:"방향",thPrice:"가격",thAmount:"금액",thSaved:"저장 상태",tradesEmpty:"모의 매수 또는 매도 후 체결 내역이 표시됩니다.",backendSaved:"백엔드 저장",localSaved:"로컬 데모",reviewTrade:"이 거래 복기",disclaimer:"교육용 데모이며 투자 조언이 아닙니다. 모든 시세와 자금은 예시 데이터입니다.",confirmClear:"브라우저 계정 기록을 지울까요? Young 백엔드 저장 데이터는 삭제되지 않으며, 삭제 후 백엔드에서 목록을 복구할 수 없습니다.",cleared:"브라우저 계정 기록을 지웠습니다.",chartLabel:"합성 예시 캔들 차트",candles:"개 일봉",marketTrend:"모의 변동",shareUnit:"주",averageUnit:"주",marketUnavailable:"데모 모드: 시세와 계정은 로컬 합성 데이터입니다.",
      stocks:{AAPL:"애플",NVDA:"엔비디아",TSLA:"테슬라"},markets:{US:"미국 시장"},currency:"USD",langButton:"中文",reasonCodes:{"":null}
    }
  };
  const catalog = { AAPL:{base:192.40, seed:13}, NVDA:{base:119.25, seed:31}, TSLA:{base:241.70, seed:7} };
  const storageKey = "aiCoachPaperPortfolioV1";
  const languageKey = "aiCoachLanguage";
  let language = localStorage.getItem(languageKey) === "ko-KR" ? "ko-KR" : "zh-CN";
  let side = "BUY";
  let currentSymbol = "AAPL";
  const t = (key) => copy[language][key];
  const byId = (id) => document.getElementById(id);
  let portfolio = loadPortfolio();

  function loadPortfolio() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Number.isFinite(saved.startingCash) && Array.isArray(saved.trades)) return saved;
    } catch { /* Invalid local demo cache is safely replaced. */ }
    return { startingCash: 100000, trades: [] };
  }
  function savePortfolio() { localStorage.setItem(storageKey, JSON.stringify(portfolio)); }
  function money(value) { return new Intl.NumberFormat(language, { style:"currency", currency:"USD", maximumFractionDigits:2 }).format(value); }
  function signedMoney(value) { return `${value > 0 ? "+" : ""}${money(value)}`; }
  function esc(value) { const node = document.createElement("span"); node.textContent = String(value ?? ""); return node.innerHTML; }
  function stockLabel(symbol) { return `${symbol} · ${t("stocks")[symbol] || symbol}`; }
  function quote(symbol) {
    const { base, seed } = catalog[symbol] || catalog.AAPL;
    const drift = Math.sin(seed * 1.7) * .023;
    return Number((base * (1 + drift)).toFixed(2));
  }
  function marketModel(symbol) {
    const { base, seed } = catalog[symbol] || catalog.AAPL;
    let previous = base * .94;
    const bars = [];
    for (let i = 0; i < 46; i++) {
      const wave = Math.sin((i + seed) * .71) * .014 + Math.cos((i + seed) * .31) * .009 + i * .00045;
      const close = base * (.94 + wave);
      const open = previous;
      const wick = base * (.004 + Math.abs(Math.sin(i + seed)) * .008);
      bars.push({ open, close, high:Math.max(open,close)+wick, low:Math.min(open,close)-wick, volume:1 });
      previous = close;
    }
    return bars;
  }
  function renderChart() {
    const bars = marketModel(currentSymbol); const width = 760; const height = 260;
    const pad = { top:12, right:62, bottom:23, left:8 }; const plotW = width-pad.left-pad.right; const plotH = height-pad.top-pad.bottom;
    const min = Math.min(...bars.map((bar)=>bar.low)); const max = Math.max(...bars.map((bar)=>bar.high)); const span = max-min || 1;
    const y = (price) => pad.top+(max-price)/span*plotH; const gap = plotW/bars.length; const candleW = Math.max(4,gap*.48);
    const grid = [0,.25,.5,.75,1].map((fraction)=>{const value=max-span*fraction;const yy=pad.top+plotH*fraction;return `<line x1="${pad.left}" y1="${yy}" x2="${pad.left+plotW}" y2="${yy}" class="grid-line"/><text x="${pad.left+plotW+8}" y="${yy+3}" class="axis-label">${value.toFixed(2)}</text>`}).join("");
    const candles = bars.map((bar,index)=>{const x=pad.left+gap*index+gap/2;const up=bar.close>=bar.open;const color=up?"#159276":"#cf6259";const top=Math.min(y(bar.open),y(bar.close));const body=Math.max(1,Math.abs(y(bar.open)-y(bar.close)));return `<g><line x1="${x}" y1="${y(bar.high)}" x2="${x}" y2="${y(bar.low)}" stroke="${color}" stroke-width="1.2"/><rect x="${x-candleW/2}" y="${top}" width="${candleW}" height="${body}" rx=".7" fill="${color}"/></g>`}).join("");
    const xLabels = [0,15,30,45].map((index)=>{const x=pad.left+gap*index+gap/2;return `<text x="${x}" y="${height-5}" text-anchor="middle" class="axis-label">${index===45?(language==="ko-KR"?"최근":"最近"):String(index+1)}</text>`}).join("");
    byId("quotePrice").textContent=money(quote(currentSymbol));byId("stockName").textContent=t("markets").US;
    byId("chartHost").setAttribute("aria-label",t("chartLabel"));
    byId("chartHost").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="presentation" aria-hidden="true">${grid}${candles}${xLabels}</svg>`;
    byId("chartSubtitle").textContent=`${currentSymbol} · ${language==="ko-KR"?"1일":"1日"} · ${t("candles").replace("根",bars.length).replace("개",bars.length)}`;
    byId("chartRange").textContent=`${language==="ko-KR"?"합성 종가":"演示收盘"} ${money(bars.at(-1).close)}`;
    const change=(bars.at(-1).close/bars.at(-2).close-1)*100;byId("quoteChange").textContent=`${change>=0?"+":""}${change.toFixed(2)}% · ${t("marketTrend")}`;byId("quoteChange").classList.toggle("negative",change<0);
  }
  function positionLedger() {
    const positions=new Map(); let realized=0;
    for(const trade of [...portfolio.trades].sort((a,b)=>a.time.localeCompare(b.time))){
      const pos=positions.get(trade.symbol)||{symbol:trade.symbol,quantity:0,cost:0,realized:0};
      if(trade.side==="BUY"){pos.cost+=trade.price*trade.quantity;pos.quantity+=trade.quantity}
      else if(pos.quantity>0){const average=pos.cost/pos.quantity;const pnl=(trade.price-average)*trade.quantity;pos.realized+=pnl;realized+=pnl;pos.cost-=average*trade.quantity;pos.quantity-=trade.quantity;if(pos.quantity<1e-8){pos.quantity=0;pos.cost=0}}
      positions.set(trade.symbol,pos);
    }
    return { positions:[...positions.values()].filter((p)=>p.quantity>0).map((p)=>({...p,average:p.cost/p.quantity,last:quote(p.symbol),value:p.quantity*quote(p.symbol),unrealized:p.quantity*quote(p.symbol)-p.cost})),realized };
  }
  function appendCell(row,value,className="") {const cell=document.createElement("td");if(className)cell.className=className;cell.textContent=String(value);row.append(cell);return cell}
  function render() {
    const {positions,realized}=positionLedger();const cash=portfolio.startingCash-portfolio.trades.reduce((sum,tr)=>sum+(tr.side==="BUY"?1:-1)*tr.price*tr.quantity,0);const positionValue=positions.reduce((sum,p)=>sum+p.value,0);
    byId("startingCash").textContent=money(portfolio.startingCash);byId("availableCash").textContent=money(cash);byId("positionsValue").textContent=money(positionValue);byId("realizedPnl").textContent=signedMoney(realized);byId("realizedPnl").className=realized>=0?"positive":"negative";
    const body=byId("positionsBody");body.replaceChildren();byId("positionsEmpty").hidden=positions.length>0;byId("positionCount").textContent=String(positions.length);
    for(const p of positions){const row=document.createElement("tr");const stock=document.createElement("td");stock.className="stock-cell";stock.textContent=p.symbol;const small=document.createElement("small");small.textContent=t("stocks")[p.symbol]||p.symbol;stock.append(small);row.append(stock);appendCell(row,`${p.quantity} ${t("shareUnit")}`);appendCell(row,money(p.average));appendCell(row,money(p.last));appendCell(row,money(p.value));appendCell(row,signedMoney(p.unrealized),p.unrealized>=0?"positive":"negative");const action=document.createElement("td");const button=document.createElement("button");button.className="button table-action";button.textContent=t("reviewPosition");button.addEventListener("click",()=>openReview(p.symbol));action.append(button);row.append(action);body.append(row)}
    const tradesBody=byId("tradesBody");tradesBody.replaceChildren();const recent=[...portfolio.trades].reverse();byId("tradesEmpty").hidden=recent.length>0;
    for(const trade of recent){const row=document.createElement("tr");appendCell(row,new Intl.DateTimeFormat(language,{dateStyle:"short",timeStyle:"short"}).format(new Date(trade.time)));const stock=document.createElement("td");stock.className="stock-cell";stock.textContent=trade.symbol;row.append(stock);appendCell(row,trade.side==="BUY"?t("buy"):t("sell"),trade.side==="BUY"?"side-buy":"side-sell");appendCell(row,money(trade.price));appendCell(row,`${trade.quantity} ${t("shareUnit")}`);appendCell(row,money(trade.price*trade.quantity));const saved=document.createElement("td");const badge=document.createElement("span");badge.className="saved-tag local";badge.textContent=t("localSaved");saved.append(badge);const review=document.createElement("button");review.className="button table-action";review.style.marginLeft="7px";review.textContent=t("reviewTrade");review.addEventListener("click",()=>openReview(trade.symbol,trade.id));saved.append(review);row.append(saved);tradesBody.append(row)}
    updateEstimatedAmount();
  }
  function updateStatus(mode="demo") {const badge=byId("connectionBadge");badge.dataset.mode=mode;const label=badge.querySelector("span");label.textContent=mode==="checking"?t("checking"):mode==="backend"?t("backend"):t("demoMode")}
  function showMessage(text,kind="") {const node=byId("orderMessage");node.textContent=text;node.className=`order-message ${kind}`}
  async function submitOrder(event) {
    event.preventDefault();showMessage("");const quantity=Number(byId("orderQuantity").value);const price=Number(byId("orderPrice").value);const symbol=currentSymbol;const reason=byId("orderReason").value.trim();
    if(!Number.isInteger(quantity)||quantity<=0){showMessage(t("invalidQuantity"),"error");return}if(!Number.isFinite(price)||price<=0){showMessage(t("invalidPrice"),"error");return}
    const {positions}=positionLedger();const position=positions.find((item)=>item.symbol===symbol);const cash=portfolio.startingCash-portfolio.trades.reduce((sum,tr)=>sum+(tr.side==="BUY"?1:-1)*tr.price*tr.quantity,0);
    if(side==="BUY"&&price*quantity>cash){showMessage(t("notEnoughCash"),"error");return}if(side==="SELL"&&(!position||quantity>position.quantity)){showMessage(t("notEnoughShares"),"error");return}
    const trade={id:`paper-${Date.now()}-${Math.random().toString(16).slice(2,7)}`,symbol,market:"US",side,price,quantity,reason,time:new Date().toISOString(),savedMode:"local"};
    const submit=byId("submitOrder");submit.disabled=true;
    showMessage(language === "ko-KR" ? "로컬 모의 체결입니다. 복기 화면에서 계정에 저장할 수 있습니다." : "模拟成交已存于本机；进入复盘页后可保存到账户。", "success");
    portfolio.trades.push(trade);savePortfolio();render();submit.disabled=false;byId("orderReason").value="";
  }
  function openReview(symbol, targetTradeId = null) {
    const allTrades=portfolio.trades.filter((trade)=>trade.symbol===symbol).sort((a,b)=>a.time.localeCompare(b.time));
    if(!allTrades.length)return;
    const targetIndex=targetTradeId?allTrades.findIndex((trade)=>trade.id===targetTradeId):allTrades.length-1;
    if(targetIndex<0)return;
    const cycles=[];let openQuantity=0;let cycleStart=0;
    allTrades.forEach((trade,index)=>{if(openQuantity===0)cycleStart=index;openQuantity+=trade.side==="BUY"?trade.quantity:-trade.quantity;if(openQuantity===0)cycles.push([cycleStart,index])});
    if(openQuantity>0)cycles.push([cycleStart,allTrades.length-1]);
    const [start,end]=cycles.find(([from,to])=>targetIndex>=from&&targetIndex<=to)||[0,allTrades.length-1];
    const trades=allTrades.slice(start,end+1);
    const pending={version:1,created_at:new Date().toISOString(),language,trade_id:trades.at(-1).backendTradeId||trades.at(-1).id,stock:{symbol,market:"US",name:t("stocks")[symbol]||symbol},executions:trades.map((trade)=>({execution_id:trade.id,side:trade.side.toLowerCase(),time:trade.time,price:trade.price,quantity:trade.quantity,reason:trade.reason||null})),execution_order_confirmed:true,saved_mode:"local_demo"};
    sessionStorage.setItem("aiCoachPendingReviewTrade",JSON.stringify(pending));location.href=`review.html${location.search}`;
  }
  function localize() {
    document.documentElement.lang=language;document.title=language==="ko-KR"?"AI 투자 코치 | 시세와 모의 거래":"AI 投资教练 | 行情与模拟交易";
    document.querySelectorAll("[data-i18n]").forEach((element)=>{const key=element.dataset.i18n;if(copy[language][key]!=null)element.textContent=copy[language][key]});
    byId("languageToggle").textContent=t("langButton");byId("symbolSelect").setAttribute("aria-label",t("selectStock"));byId("orderSymbol").setAttribute("aria-label",t("symbol"));byId("orderPrice").setAttribute("aria-label",t("price"));byId("orderQuantity").setAttribute("aria-label",t("quantity"));byId("orderReason").setAttribute("aria-label",t("reason"));byId("orderReason").placeholder=t("reasonPlaceholder");
    document.querySelector('[data-i18n="tradesSub"]').textContent = language === "ko-KR" ? "로컬 합성 체결 · 계정 저장은 복기 화면에서 별도 처리" : "本机合成成交 · 账户保存由复盘页单独完成";
    document.querySelectorAll('a[href="review.html"]').forEach(link => { link.href = `review.html${location.search}`; });
    byId("buyTab").classList.toggle("selected",side==="BUY");byId("sellTab").classList.toggle("selected",side==="SELL");byId("submitOrder").classList.toggle("sell-mode",side==="SELL");byId("submitOrder").querySelector("span").textContent=side==="BUY"?t("confirmBuy"):t("confirmSell");updateStatus("demo");render();
  }
  function initializeStocks() {const select=byId("symbolSelect");select.replaceChildren();for(const symbol of Object.keys(catalog)){const option=document.createElement("option");option.value=symbol;option.textContent=stockLabel(symbol);select.append(option)}select.value=currentSymbol;select.onchange=()=>{currentSymbol=select.value;byId("orderSymbol").value=currentSymbol;byId("orderPrice").value=quote(currentSymbol).toFixed(2);renderChart();render()};byId("orderSymbol").value=currentSymbol;byId("orderPrice").value=quote(currentSymbol).toFixed(2);byId("currency").textContent=t("currency");byId("stockName").textContent=t("markets").US}
  function updateEstimatedAmount() {const price=Number(byId("orderPrice").value);const quantity=Number(byId("orderQuantity").value);byId("estimatedAmount").textContent=price>0&&quantity>0?money(price*quantity):"—"}
  byId("buyTab").addEventListener("click",()=>{side="BUY";localize()});byId("sellTab").addEventListener("click",()=>{side="SELL";localize()});byId("orderPrice").addEventListener("input",updateEstimatedAmount);byId("orderQuantity").addEventListener("input",updateEstimatedAmount);byId("orderForm").addEventListener("submit",submitOrder);
  byId("languageToggle").addEventListener("click",()=>{language=language==="zh-CN"?"ko-KR":"zh-CN";localStorage.setItem(languageKey,language);localize();initializeStocks();renderChart()});
  byId("clearDemo").addEventListener("click",()=>{if(!window.confirm(t("confirmClear")))return;portfolio={startingCash:100000,trades:[]};savePortfolio();render();showMessage(t("cleared"),"success")});
  initializeStocks();renderChart();localize();
})();
