import json
import os
from typing import Any, Optional

from fastapi import FastAPI
from openai import OpenAI
from pydantic import BaseModel, Field


app = FastAPI(
    title="AI Investment Coach - AI Service",
    description="Analyze investor decision behavior, not stock price direction.",
    version="0.1.0",
)


class Stock(BaseModel):
    symbol: str
    name: Optional[str] = None
    market: Optional[str] = None


class Trade(BaseModel):
    buy_time: str
    sell_time: Optional[str] = None
    buy_price: float
    sell_price: Optional[float] = None
    quantity: int
    profit_loss_amount: Optional[float] = None
    profit_loss_rate: Optional[float] = None


class Decision(BaseModel):
    buy_reason: str
    sell_reason: Optional[str] = None
    confidence_level: Optional[int] = Field(default=None, ge=1, le=5)
    planned_holding_period: Optional[str] = None
    actual_holding_period_minutes: Optional[int] = None


class MarketSnapshot(BaseModel):
    trend_before_buy: Optional[str] = None
    volume_price_summary: Optional[str] = None
    kline_summary: Optional[str] = None
    news_summary: Optional[str] = None


class AnalysisContext(BaseModel):
    language: str = "zh-CN"
    analysis_goal: str = "Analyze investment decision behavior, not future stock direction."
    risk_notice_required: bool = True


class TradeAnalysisRequest(BaseModel):
    user_id: str
    trade_id: str
    stock: Stock
    trade: Trade
    decision: Decision
    market_snapshot: MarketSnapshot
    analysis_context: AnalysisContext = AnalysisContext()
    rag_context: list[dict[str, Any]] = []


PROMPT_TEMPLATE = """
你是一个 AI 投资行为教练。

你的任务不是预测股票走势，也不是给出买卖建议。
你的任务是根据用户的一笔交易记录，分析用户的投资决策行为，识别可能的不良投资习惯，并生成投资性格标签。

请严格遵守：
1. 不要判断这只股票未来会涨还是跌。
2. 不要给出“应该买入/卖出/持有”的直接投资建议。
3. 重点分析用户的行为模式，例如追涨、恐慌卖出、缺少计划、过度自信、止损不清晰等。
4. 输出必须是合法JSON，不要输出Markdown。
5. 分析要温和、具体、可执行。
6. 如果信息不足，请在JSON中说明不确定性。

用户交易数据：

{trade_json}
"""


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}


@app.post("/analyze-trade")
def analyze_trade(req: TradeAnalysisRequest) -> dict[str, Any]:
    use_mock = os.getenv("USE_MOCK_LLM", "true").lower() == "true"
    has_api_key = bool(os.getenv("OPENAI_API_KEY"))

    if use_mock or not has_api_key:
        return mock_behavior_analysis(req)

    return llm_behavior_analysis(req)


def llm_behavior_analysis(req: TradeAnalysisRequest) -> dict[str, Any]:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    prompt = PROMPT_TEMPLATE.format(
        trade_json=json.dumps(req.model_dump(), ensure_ascii=False, indent=2)
    )

    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {
                "role": "system",
                "content": "你是严谨、温和的投资行为分析教练。只输出合法JSON。",
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    content = response.choices[0].message.content or "{}"
    return json.loads(content)


def mock_behavior_analysis(req: TradeAnalysisRequest) -> dict[str, Any]:
    buy_reason = req.decision.buy_reason or ""
    sell_reason = req.decision.sell_reason or ""
    market_text = " ".join(
        filter(
            None,
            [
                req.market_snapshot.trend_before_buy,
                req.market_snapshot.volume_price_summary,
                req.market_snapshot.kline_summary,
                req.market_snapshot.news_summary,
            ],
        )
    )

    problems: list[dict[str, Any]] = []
    tags: list[dict[str, Any]] = []

    if contains_any(buy_reason + market_text, ["担心错过", "追涨", "快速上涨", "快速拉升", "连续阳线"]):
        problems.append(
            {
                "problem_code": "FOMO_BUYING",
                "problem_name": "害怕错过而追涨买入",
                "severity": "high",
                "evidence": "买入理由或市场快照显示，用户可能在价格快速上涨后受到害怕错过的情绪影响。",
                "explanation": "这类行为容易让买入点接近短期情绪高点，且常常缺少回撤预案。",
            }
        )
        tags.append(
            {
                "tag_code": "MOMENTUM_CHASER",
                "tag_name": "短线追涨型",
                "confidence": 0.82,
            }
        )

    if contains_any(sell_reason, ["害怕", "恐慌", "怕亏", "继续亏损", "受不了"]):
        problems.append(
            {
                "problem_code": "PANIC_SELLING",
                "problem_name": "亏损后恐慌卖出",
                "severity": "medium",
                "evidence": "卖出理由显示用户主要因为害怕继续亏损而卖出。",
                "explanation": "卖出动作可能更多来自亏损压力，而不是来自提前制定的交易规则。",
            }
        )
        tags.append(
            {
                "tag_code": "LOSS_SENSITIVE",
                "tag_name": "亏损敏感型",
                "confidence": 0.76,
            }
        )

    if not contains_any(buy_reason + sell_reason, ["止损", "止盈", "计划", "规则", "条件"]):
        problems.append(
            {
                "problem_code": "NO_EXIT_PLAN",
                "problem_name": "缺少明确退出计划",
                "severity": "medium",
                "evidence": "买入和卖出理由中没有看到清晰的止盈、止损或退出条件。",
                "explanation": "缺少退出计划会让用户在行情波动时临时决策，更容易被情绪带走。",
            }
        )
        tags.append(
            {
                "tag_code": "PLAN_WEAK",
                "tag_name": "交易计划薄弱型",
                "confidence": 0.71,
            }
        )

    if not problems:
        problems.append(
            {
                "problem_code": "INSUFFICIENT_SIGNAL",
                "problem_name": "信息不足，暂未发现明确行为问题",
                "severity": "low",
                "evidence": "当前交易记录中可用于判断行为模式的信息有限。",
                "explanation": "需要结合更多交易记录、买卖前计划和市场快照来判断稳定模式。",
            }
        )
        tags.append(
            {
                "tag_code": "NEEDS_MORE_DATA",
                "tag_name": "需要更多样本型",
                "confidence": 0.45,
            }
        )

    return {
        "trade_id": req.trade_id,
        "analysis_type": "single_trade_behavior_analysis",
        "behavior_summary": build_summary(problems),
        "detected_behavior_problems": problems,
        "personality_tags": tags,
        "coaching_advice": [
            "下次买入前，先写下买入条件、止损条件和卖出条件。",
            "如果买入理由只是害怕错过，建议先等待确认信号，而不是立刻追入。",
            "每笔交易结束后记录：我是按计划卖出，还是因为情绪卖出。",
        ],
        "reflection_questions": [
            "这次买入是因为计划出现了，还是因为我害怕错过？",
            "如果买入后立刻下跌，我原本准备亏损多少卖出？",
            "卖出时我是在执行规则，还是在逃避亏损带来的不舒服？",
        ],
        "risk_notice": "以上内容仅用于投资行为复盘和教育，不构成任何投资建议。",
        "uncertainty": {
            "level": "medium",
            "reason": "当前只分析了一笔交易，无法稳定判断用户长期投资性格，需要结合多笔交易记录。",
        },
    }


def contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def build_summary(problems: list[dict[str, Any]]) -> str:
    names = [problem["problem_name"] for problem in problems if problem["severity"] != "low"]
    if not names:
        return "当前样本信息有限，暂未发现明确的不良投资行为模式。"
    return "本次交易可能体现出：" + "、".join(names) + "。"

