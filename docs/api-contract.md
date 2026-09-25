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

- `as_of` 必须带时区，不能晚于当前时间。转为纽约日期后，严格排除当天和之后的日 K。
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

Mock 模式不会假装完成图片识别，而是返回 `status: "mock"` 和清楚的说明。

### RAG知识库导入

ai-service 使用 ChromaDB 持久化向量，Embeddings 由 OPENAI_EMBEDDING_MODEL 生成。团队原创知识卡位于 ai-service/knowledge/behavior_principles.jsonl。在 ai-service 目录执行 python scripts/ingest_knowledge.py 建库；向量目录 ai-service/.chroma 已加入忽略规则。导入书籍材料前应确认拥有使用权并保留准确来源信息。

### 网页演示

仓库根目录执行 `python -m http.server 5173 --directory web-demo`，打开 `http://localhost:5173`。网页无需 Node/npm 构建依赖；优先调用 AI 服务，服务不可用时显示明确标记的本地规则演示结果。AI 服务开发环境默认允许 `localhost:5173` 和 Expo Web 的 `localhost:8081`，可通过 `AI_SERVICE_CORS_ORIGINS` 调整。

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

## 后端主业务接口草案

### 完成学习任务

```http
POST /api/learning/complete
```

```json
{
  "user_id": "user_001",
  "lesson_id": "lesson_001"
}
```

### 提交模拟交易

```http
POST /api/trades
```

```json
{
  "user_id": "user_001",
  "symbol": "AAPL",
  "side": "BUY",
  "price": 218.5,
  "quantity": 10,
  "reason_code": "FOMO",
  "reason_text": "看到价格快速上涨，担心错过机会"
}
```
