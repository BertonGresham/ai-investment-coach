# API接口契约

所有模块先按这个文档对齐。接口后续可以调整，但调整前需要在Pull Request里说明影响范围。

可运行的中韩文请求样例、联调检查脚本、错误码与模块分工见 [AI 模块联调](ai-integration-guide.md)。

## 服务端口

| 服务 | 本地端口 | 说明 |
| --- | --- | --- |
| backend-server | 8080 | 主业务后端 |
| ai-service | 8001 | AI行为分析服务 |
| data-service | 8002 | CSV、K线、资讯数据服务 |
| frontend-app | Expo默认 | 移动端App |

## 自动历史行情背景

`POST /analyze-market-context` 位于 AI 服务，首版只支持美股日 K。将来由数据服务替换行情适配器。

```json
{
  "symbol": "AAPL",
  "market": "US",
  "as_of": "2025-07-25T10:30:00-04:00",
  "source": "yahoo",
  "language": "zh-CN",
  "focus": "fear_of_missing_out"
}
```

- `as_of` 支持带时区的时间或 `YYYY-MM-DD` 日期，不能晚于当前时间/纽约当前日期。完整时间转为纽约日期；仅日期输入直接视为交易日期，不补造时刻。严格排除当天和之后的日 K。
- `source` 为 `yahoo`（默认，真实历史数据）或 `demo`（明确标注的合成数据，无外网请求）。不受 `USE_MOCK_LLM` 控制；即使 Mock，选择 Yahoo 仍会读取真实行情。
- `focus` 为 `general` 或 `fear_of_missing_out`；只决定参考笔记，不表示已经检测到行为问题。
- 响应含 `source/provider/retrieved_at/exchange_timezone/cutoff_date_exclusive/data_start/data_end/bar_count/price_basis`、`metrics`、`kline_summary`、`book_notes`、`rag_context`、`warnings`。
- `metrics`：`last_close`（USD）、`daily_change_pct`（末两根日 K 百分比变化）、`five_session_change_pct`（最后 6 根日 K 首尾变化百分比）、`sma20`（末 20 根收盘均值）、`volume_vs_previous20`（最后成交量 / 此前 20 根均量）。涨幅单位是百分比，不是小数收益率；样本或有效分母不足时为 `null`。
- `book_notes` 带作者、书名、年份、章节、原文与目录链接、权利范围，以及区分自行概括和原文引述的 `content_type`。
- `explanation_mode=calculated_facts_and_curated_notes`、`retrieval_method=curated_topic_rules`：此接口不调用 LLM/Embeddings，不产生模型费用。
- 把响应的 `kline_summary` 放入 `/analyze-trade` 的 `market_snapshot.kline_summary`，把 `rag_context` 原样传入，其他行情字段由主后端保存。不要把整份响应直接放入 `market_snapshot`。
- 无数据返回 404；股票类型不支持或输入不合法返回 422；供应商失败或数据异常返回 502。行情错误为 `detail: {code, message}`，普通参数校验保留 FastAPI 标准结构。
- 没有新闻和公告数据时不生成相关内容。非美股可不带行情摘要，继续使用原行为分析接口。
- 该开发服务无身份认证、限流与公开行情再分发授权，不应直接暴露到公网。公开部署需由业务后端加入这些边界。

## 通用健康检查

### Request

```http
GET /health
```

### Response

```json
{
  "status": "ok",
  "service": "ai-service",
  "analysis_mode": "mock"
}
```

`analysis_mode` 为 `mock` 或 `llm`，便于演示端明确标注当前结果来自后端规则 Mock 还是 LLM。

Spring Boot后端使用：

```http
GET /api/health
```

## AI行为分析

### Request

```http
POST /analyze-trade
Content-Type: application/json
```

```json
{
  "user_id": "user_001",
  "trade_id": "trade_20250725_001",
  "stock": {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "market": "US"
  },
  "trade": {
    "buy_time": "2025-07-25T10:15:00",
    "sell_time": "2025-07-25T14:40:00",
    "buy_price": 218.5,
    "sell_price": 213.2,
    "quantity": 10,
    "profit_loss_amount": -53.0,
    "profit_loss_rate": -0.0243
  },
  "decision": {
    "buy_reason": "看到价格快速上涨，担心错过机会，所以买入",
    "sell_reason": "下跌后害怕继续亏损，所以卖出",
    "confidence_level": 4,
    "planned_holding_period": "当日短线",
    "actual_holding_period_minutes": 265
  },
  "market_snapshot": {
    "trend_before_buy": "开盘后快速拉升，短时间涨幅较大",
    "volume_price_summary": "价格上涨同时成交量放大，但随后出现放量滞涨",
    "kline_summary": "买入前连续3根阳线，买入后出现长上影线，随后回落",
    "news_summary": "无重大利好公告"
  },
  "analysis_context": {
    "language": "zh-CN",
    "analysis_goal": "分析用户本次交易中的决策行为问题，而不是预测股票未来走势",
    "risk_notice_required": true
  },
  "rag_context": []
}
```

### Response

```json
{
  "trade_id": "trade_20250725_001",
  "trade_time": "2025-07-25T10:15:00",
  "analysis_type": "single_trade_behavior_analysis",
  "behavior_summary": "用户本次交易表现出追涨买入和亏损后恐慌卖出的倾向。",
  "detected_behavior_problems": [
    {
      "problem_code": "FOMO_BUYING",
      "problem_name": "害怕错过的情绪可能影响买入",
      "severity": "medium",
      "evidence": "买入理由中提到担心错过机会。",
      "explanation": "单笔记录不足以确认是否形成稳定的追涨模式。",
      "theory_reference": null
    }
  ],
  "personality_tags": [
    {
      "tag_code": "FOMO_SENSITIVE",
      "tag_name": "容易受错失焦虑影响",
      "confidence": 0.62
    }
  ],
  "coaching_advice": [
    "下次买入前先写下买入条件、止损条件和卖出条件。"
  ],
  "reflection_questions": [
    "这次买入是因为计划出现了，还是因为害怕错过？"
  ],
  "risk_notice": "以上内容仅用于投资行为复盘和教育，不构成任何投资建议。",
  "uncertainty": {
    "level": "high",
    "reason": "当前仅有一笔交易记录；行为标签是待验证的线索，不代表长期投资性格。"
  }
}
```

### 累积投资行为画像

POST /analyze-profile 接收由 /analyze-trade 返回的分析结果列表。画像时间窗为近 7、30、90 天，按最新一笔交易时间计算；as_of 可指定统计基准时间。language 支持 zh-CN、ko-KR。少于 3 笔样本时，置信级别为 low。

~~~json
{
  "user_id": "user_001",
  "trade_analyses": [
    {
      "trade_id": "trade_20250725_001",
      "trade_time": "2025-07-25T10:15:00",
      "analysis_type": "single_trade_behavior_analysis",
      "behavior_summary": "本次记录可能体现出错失焦虑。",
      "detected_behavior_problems": [
        {
          "problem_code": "FOMO_BUYING",
          "problem_name": "买入理由可能受到害怕错过的情绪影响",
          "severity": "medium",
          "evidence": "买入理由中提到担心错过机会。",
          "explanation": "需要结合事前计划和更多交易判断是否重复出现。",
          "theory_reference": null
        }
      ],
      "personality_tags": [
        {
          "tag_code": "FOMO_SENSITIVE",
          "tag_name": "容易受错失焦虑影响",
          "confidence": 0.62
        }
      ],
      "coaching_advice": ["下次交易前写下入场条件和退出条件。"],
      "reflection_questions": ["这次买入是否符合事前计划？"],
      "risk_notice": "以上内容仅用于投资行为复盘和教育，不构成任何投资建议。",
      "uncertainty": {
        "level": "high",
        "reason": "仅有一笔交易样本。"
      }
    }
  ],
  "as_of": null
}
~~~

Response 包含 short_term、medium_term、long_term 三个窗口的样本数、置信级别、重复标签和摘要。画像只汇总行为线索，不构成心理诊断。

### 交易截图识别

`POST /recognize-trade-screenshot` 使用 `multipart/form-data`，表单字段为 `file`（PNG/JPEG/WebP，最大 8 MB）和 `language`（`zh-CN` 或 `ko-KR`）。LLM 模式通过视觉模型提取一笔明确交易的代码、市场、买卖时间/价格和数量；理由只会在截图中明确可见时读取，不从盈亏或 K 线推测。含糊字段返回 null，并提供 `field_confidence` 和 `warnings`。调用方必须让用户确认识别结果，再提交 `/analyze-trade`。

识别先返回 `record`：`kind` 为 `security_trade`、`cash_flow` 或 `unknown`，`label` 为截图原始交易类型（可空），`side` 为 `buy`、`sell`、`round_trip` 或 `unknown`。仅明确证券成交且方向可确认时允许导入。利息、分红、入出金等资金流水返回 `status: not_trade`，所有交易字段为空，不计入行为分析或交易样本；不得把资金金额、税额、余额或 0 占位符映射为价格、数量、盈亏。类型或方向不明返回 `needs_review`。单侧成交只填入该侧字段，不自动配对其他买卖记录。该分类不是资金流水记账功能。

网页支持多图队列（最多 10 张，单张 8 MiB、合计 32 MiB），逐张调用本接口，不新增多文件后端端点。结果按文件保存，失败可单独重试。用户可勾选 2–10 张成交图，核对后作为一组 `trade.executions` 提交 `/analyze-trade`；不自动配对或批量入库。

前端合并仅接受 `recognized/security_trade`，方向为 `buy`、`sell` 或明确关联的 `round_trip`（拆成两条成交）。已知股票和市场按去空格、转大写比较，冲突即阻止；缺身份信息提示本人核实。每条保留来源、价格、数量、时间和理由，可在确认前修正。每次修改撤销确认。用户必须核对同一账户/股票/市场/币种，从首次买入开始没有遗漏和重复；不能仅凭同代码认定。合并不触发额外模型调用，分析请求不携带图片或文件名。

### 分批成交输入与输出

兼容原有 `trade` 单笔字段；提供 `trade.executions` 时，以成交明细为准，服务器重新推导并覆盖汇总字段，不信任客户端盈亏。示例见 `ai-service/examples/trade.executions.json`。每条包含 `execution_id`、`side`（buy/sell）、`time`（ISO 8601，可为日期、未注明时区的当地时间或完整时间）、`price`（1e-8 至 1e12）、`quantity`（正整数）、可空 `reason`。最多 100 条，累计买入不超过 1 亿股。完整时间按绝对时刻排序；不完整时间保留原精度，按记录日期排列。同日缺时刻或混用已知/未知时区时，必须核对列表顺序并传 `trade.execution_order_confirmed: true`，否则返回 422；不能把自动排列当成识别到的盘中先后。重复 ID、同时间/方向/价格/数量的不可区分记录、任何时刻卖出超过持仓均返回 422。暂不支持做空、期初持仓、手续费税费汇率或公司行动调整。

`execution_summary.ordering_basis` 标记顺序来源：`timestamp`、`recorded_date_or_local_time` 或 `recorded_date_and_confirmed_sequence`。后者基于用户核对的同日先后，不是精确时刻。`decision.buy_reason` 现在可省略或为 null，空白归为 null；不要用模拟理由补空白。理由缺失仅限制行为推断，不阻止事实复盘。

截图接口新增 `details`（可空的 `stock_name/currency/gross_amount/fee/tax`）和 `derived_fields`。只有明确的税费前成交总额与价格或整数股数可用于自动补另一项；不使用余额、净出入金或税费倒推，不覆盖已有值。计算字段有来源标记，没有伪造的 OCR 自评分。费用只展示核对，当前盈亏仍不含费用。缺年份、无法解析的日期、无法辨认的关键成交字段仍需补充清晰记录。

响应新增可空 `execution_summary`，由程序计算而非 LLM 生成：买卖次数、累计数量、买卖加权均价、剩余数量/成本/均价、已实现盈亏及收益率、逐笔 `timeline`。每条时间线包含原始明细、该方向的 `occurrence`（第几次买入或卖出）、操作后剩余股数及该笔卖出的已实现盈亏。盈亏基于移动加权平均成本，收益率分母为已售部分的成本；未卖出时为 null。数字保留至 8 位小数，不代表券商税务计算。分析摘要需结合逐笔理由和操作，分批本身不是行为问题。日 K 仅对应首次买入前，不能推广为各次成交的行情证据。整组持仓在画像中仍计作一个样本。

Mock 模式不会假装完成图片识别，而是返回 `status: "mock"` 和清楚的说明。

### RAG知识库导入

ai-service 使用 ChromaDB 持久化向量，Embeddings 由 OPENAI_EMBEDDING_MODEL 生成。团队原创知识卡位于 ai-service/knowledge/behavior_principles.jsonl。在 ai-service 目录执行 python scripts/ingest_knowledge.py 建库；向量目录 ai-service/.chroma 已加入忽略规则。导入书籍材料前应确认拥有使用权并保留准确来源信息。

### 网页演示

仓库根目录执行 `python -m http.server 5173 --bind 127.0.0.1 --directory web-demo`，打开 `http://127.0.0.1:5173`。根页面为中韩文模拟交易主页，`/review.html` 为 AI 复盘与账户历史。网页无需 Node/npm 构建依赖。首页行情为合成演示，成交只保存在本机，导入复盘并由登录用户提交后才进入数据库。

复盘的“账户历史”模式使用业务后端保存交易和报告；服务失败会明确报错，不自动切换到本地结果或宣称保存成功。“临时演示”须显式选择，不保存到账户历史。Mock 是分析来源，与是否存入数据库是两回事。`api`、`backend` 查询参数分别指定 AI 与业务后端地址；非默认网页端口需要在 `AI_SERVICE_CORS_ORIGINS` 和 `BACKEND_CORS_ORIGINS` 中配置精确来源。开发 HTTP 服务不可直接暴露公网。

## CSV解析

### Request

```http
POST /parse-csv
Content-Type: multipart/form-data
```

字段：

```text
file: broker_trades.csv
```

### Response

```json
{
  "records": [
    {
      "trade_id": "csv_1",
      "symbol": "AAPL",
      "side": "BUY",
      "trade_time": "2025-07-25T10:15:00",
      "price": 218.5,
      "quantity": 10,
      "amount": 2185.0
    }
  ],
  "warnings": []
}
```

## 后端主业务接口

以下为集成分支的已实现契约，完整说明见 [Young 后端首轮联调](backend-young.md)。不得再使用旧版顶层 `symbol/side/price/quantity` 草案调用保存接口。

### 提交逐笔成交

先通过 `/api/auth/register` 或 `/api/auth/login` 获取凭证。用户归属来自登录身份，不由客户端自填 `user_id` 决定。

```http
POST /api/trades
Content-Type: application/json
Authorization: Bearer <access_token>
Idempotency-Key: example-trade-001
```

```json
{
  "stock": {"symbol": "AAPL", "market": "US"},
  "trade": {
    "executions": [
      {"execution_id": "buy-1", "side": "buy", "time": "2026-09-11T14:00:00Z", "price": 100, "quantity": 10, "reason": null},
      {"execution_id": "sell-1", "side": "sell", "time": "2026-09-14T14:00:00Z", "price": 120, "quantity": 5, "reason": null}
    ]
  }
}
```

这是合成数据，不是真实行情。成功返回交易对象及服务器生成的 `trade_id`。同一次提交重试复用幂等键；新交易生成新键。可选分析上下文字段及校验规则见上述后端文档。

后续调用均带 Bearer 凭证：

1. `POST /api/trades/{trade_id}/analysis`：分析已保存交易，保存唯一报告；失败时重试此接口，不重复新建交易。
2. `GET /api/trades/{trade_id}/report`：读取报告，AI 输出在 `result` 字段中。
3. `GET /api/trades?offset=0&limit=20` 与 `GET /api/reports?offset=0&limit=20`：当前用户历史。

## 尚未实现的业务草案

### 完成学习任务

以下仅用于讨论，尚不能作为可调用接口；最终身份鉴权和积分防重复领取规则需由后端负责人确认。

```http
POST /api/learning/complete
```

```json
{
  "user_id": "user_001",
  "lesson_id": "lesson_001"
}
```
