# API接口契约

所有模块先按这个文档对齐。接口后续可以调整，但调整前需要在Pull Request里说明影响范围。

## 服务端口

| 服务 | 本地端口 | 说明 |
| --- | --- | --- |
| backend-server | 8080 | 主业务后端 |
| ai-service | 8001 | AI行为分析服务 |
| data-service | 8002 | CSV、K线、资讯数据服务 |
| frontend-app | Expo默认 | 移动端App |

## 通用健康检查

### Request

```http
GET /health
```

### Response

```json
{
  "status": "ok",
  "service": "ai-service"
}
```

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
  "analysis_type": "single_trade_behavior_analysis",
  "behavior_summary": "用户本次交易表现出追涨买入和亏损后恐慌卖出的倾向。",
  "detected_behavior_problems": [
    {
      "problem_code": "FOMO_BUYING",
      "problem_name": "害怕错过而追涨买入",
      "severity": "high",
      "evidence": "买入理由包含担心错过，且买入前价格已快速拉升。",
      "explanation": "用户可能被短期上涨刺激，缺少等待确认和风险预案。"
    }
  ],
  "personality_tags": [
    {
      "tag_code": "MOMENTUM_CHASER",
      "tag_name": "短线追涨型",
      "confidence": 0.82
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
    "level": "medium",
    "reason": "当前只分析了一笔交易，需要结合多笔交易记录判断长期模式。"
  }
}
```

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

