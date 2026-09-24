from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import ValidationError

from app.prompts import SYSTEM_PROMPT, build_analysis_payload, build_user_prompt
from app.rag import retrieve_theory
from app.schemas import (
    InvestmentProfileResponse,
    ProfilePattern,
    ProfileRequest,
    ProfileWindow,
    RagEvidence,
    TradeAnalysisRequest,
    TradeAnalysisResponse,
)

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Investment Coach - AI Service",
    description="Analyze investor decision behavior, not stock price direction.",
    version="0.2.0",
)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "AI_SERVICE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    mode = "mock" if os.getenv("USE_MOCK_LLM", "true").lower() == "true" else "llm"
    return {"status": "ok", "service": "ai-service", "analysis_mode": mode}


@app.post("/analyze-trade", response_model=TradeAnalysisResponse)
def analyze_trade(req: TradeAnalysisRequest) -> TradeAnalysisResponse:
    use_mock = os.getenv("USE_MOCK_LLM", "true").lower() == "true"
    api_key = os.getenv("OPENAI_API_KEY")
    if use_mock:
        return mock_behavior_analysis(req)
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="LLM mode is enabled but OPENAI_API_KEY is not configured.",
        )
    return llm_behavior_analysis(req, api_key)


@app.post("/analyze-profile", response_model=InvestmentProfileResponse)
def analyze_profile(req: ProfileRequest) -> InvestmentProfileResponse:
    parsed_times = [_parse_trade_time(item.trade_time) for item in req.trade_analyses]
    as_of = _normalize_datetime(req.as_of) if req.as_of else max(parsed_times)

    windows = []
    for period, days in (
        ("short_term", 7),
        ("medium_term", 30),
        ("long_term", 90),
    ):
        start = as_of - timedelta(days=days)
        selected = [
            item
            for item, traded_at in zip(req.trade_analyses, parsed_times)
            if start <= traded_at <= as_of
        ]
        windows.append(_aggregate_window(period, days, selected, start, as_of))

    return InvestmentProfileResponse(
        user_id=req.user_id,
        as_of=as_of,
        short_term=windows[0],
        medium_term=windows[1],
        long_term=windows[2],
        limitation=(
            "画像由已提交的单笔分析结果汇总，不是心理诊断或投资建议。"
            "交易样本较少时，标签只代表待观察的倾向。"
        ),
    )


def llm_behavior_analysis(
    req: TradeAnalysisRequest,
    api_key: str,
) -> TradeAnalysisResponse:
    query = " ".join(
        value
        for value in (
            req.decision.buy_reason,
            req.decision.sell_reason or "",
            req.market_snapshot.trend_before_buy or "",
            req.market_snapshot.volume_price_summary or "",
            req.market_snapshot.kline_summary or "",
        )
        if value
    )
    retrieved = retrieve_theory(query)
    payload = build_analysis_payload(req, retrieved)
    try:
        client = OpenAI(
            api_key=api_key,
            timeout=30.0,
            max_retries=2,
        )
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(payload)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=1_500,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("The model returned an empty response.")
        raw_result = json.loads(content)
        if not isinstance(raw_result, dict):
            raise ValueError("The model response must be a JSON object.")
        raw_result["trade_id"] = req.trade_id
        raw_result["trade_time"] = req.trade.buy_time
        raw_result["analysis_type"] = "single_trade_behavior_analysis"
        _keep_supported_theory_references(raw_result, [*req.rag_context, *retrieved])
        return TradeAnalysisResponse.model_validate(raw_result)
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        logger.exception("The model returned an invalid analysis payload.")
        raise HTTPException(
            status_code=502,
            detail="The AI service could not produce a valid analysis. Please retry.",
        ) from exc
    except Exception as exc:
        logger.exception("LLM analysis request failed.")
        raise HTTPException(
            status_code=502,
            detail="The AI provider is temporarily unavailable. Please retry.",
        ) from exc


def mock_behavior_analysis(req: TradeAnalysisRequest) -> TradeAnalysisResponse:
    buy_reason = req.decision.buy_reason
    sell_reason = req.decision.sell_reason or ""
    decisions = buy_reason + " " + sell_reason
    supplied_notes = req.rag_context

    problems: list[dict[str, Any]] = []
    tags: list[dict[str, Any]] = []

    if contains_any(
        buy_reason,
        ["担心错过", "怕错过", "害怕错过", "追涨", "追高", "怕买不到"],
    ):
        problems.append(
            _problem(
                "FOMO_BUYING",
                "买入理由可能受到害怕错过的情绪影响",
                "medium",
                "买入理由中提到担心错过机会。",
                "这说明情绪可能参与了入场决策；仅凭这一笔记录，无法确认是否形成稳定的追涨模式。",
                _theory_reference(supplied_notes, "错过"),
            )
        )
        tags.append(
            {
                "tag_code": "FOMO_SENSITIVE",
                "tag_name": "容易受错失焦虑影响",
                "confidence": 0.62,
            }
        )

    if contains_any(sell_reason, ["恐慌", "害怕继续亏", "怕继续亏", "受不了亏损"]):
        problems.append(
            _problem(
                "EMOTION_DRIVEN_EXIT",
                "卖出可能受到亏损压力影响",
                "medium",
                "卖出理由提到害怕继续亏损。",
                "亏损后的不适感可能影响了卖出时机。需要对照买入前的退出条件，才能判断这是否偏离原计划。",
                _theory_reference(supplied_notes, "止损"),
            )
        )
        tags.append(
            {
                "tag_code": "LOSS_SENSITIVE",
                "tag_name": "亏损压力敏感",
                "confidence": 0.60,
            }
        )

    if not contains_any(decisions, ["止损", "止盈", "计划", "规则", "条件", "退出"]):
        problems.append(
            _problem(
                "EXIT_PLAN_NOT_RECORDED",
                "记录中没有明确的退出计划",
                "low",
                "本次提交的买卖理由中没有提到止盈、止损或退出条件。",
                "这只能说明当前记录未写出退出规则，不能据此断定用户没有制定计划。",
                _theory_reference(supplied_notes, "交易计划"),
            )
        )

    if not problems:
        problems.append(
            _problem(
                "INSUFFICIENT_SIGNAL",
                "当前记录未显示明确的行为问题",
                "low",
                "买卖理由中没有出现足以支持特定行为判断的线索。",
                "建议保留事前计划和更多交易记录，再观察是否存在重复模式。",
                _theory_reference(supplied_notes, "小样本"),
            )
        )
        tags.append(
            {
                "tag_code": "NEEDS_MORE_DATA",
                "tag_name": "需要更多样本",
                "confidence": 0.45,
            }
        )

    risk_notice = (
        "以上内容仅用于投资行为复盘和教育，不构成任何投资建议。"
        if req.analysis_context.risk_notice_required
        else "以上内容是基于单笔记录的行为复盘。"
    )
    names = [item["problem_name"] for item in problems if item["severity"] != "low"]
    summary = (
        "本次记录可能体现出：" + "；".join(names) + "。"
        if names
        else "本次记录的信息有限，暂未发现明确的行为问题。"
    )
    return TradeAnalysisResponse(
        trade_id=req.trade_id,
        trade_time=req.trade.buy_time,
        analysis_type="single_trade_behavior_analysis",
        behavior_summary=summary,
        detected_behavior_problems=problems,
        personality_tags=tags,
        coaching_advice=[
            "下次交易前写下入场理由、退出条件和可接受的最大损失。",
            "交易结束后对照事前计划复盘，不要只用盈亏评价决策。",
        ],
        reflection_questions=[
            "这次买入是否符合事前写下的条件？",
            "卖出时我是在执行原计划，还是在回应当下情绪？",
            "如果重做一次，我会保留哪条规则？",
        ],
        risk_notice=risk_notice,
        uncertainty={
            "level": "high",
            "reason": "当前仅有一笔交易记录；行为标签是待验证的线索，不代表长期投资性格。",
        },
    )


def _problem(
    code: str,
    name: str,
    severity: str,
    evidence: str,
    explanation: str,
    theory_reference: str | None,
) -> dict[str, Any]:
    return {
        "problem_code": code,
        "problem_name": name,
        "severity": severity,
        "evidence": evidence,
        "explanation": explanation,
        "theory_reference": theory_reference,
    }


def _theory_reference(notes: list[RagEvidence], keyword: str) -> str | None:
    for note in notes:
        if keyword in note.title or keyword in note.content:
            return f"{note.title}（{note.source}）"
    return None


def _keep_supported_theory_references(
    result: dict[str, Any], notes: list[RagEvidence]
) -> None:
    allowed = {f"{item.title}（{item.source}）" for item in notes}
    problems = result.get("detected_behavior_problems")
    if not isinstance(problems, list):
        return
    for problem in problems:
        if isinstance(problem, dict) and problem.get("theory_reference") not in allowed:
            problem["theory_reference"] = None


def _aggregate_window(
    period: str,
    days: int,
    analyses: list[TradeAnalysisResponse],
    start: datetime,
    end: datetime,
) -> ProfileWindow:
    tag_counts: Counter[str] = Counter()
    problem_counts: Counter[str] = Counter()
    tag_names: dict[str, str] = {}
    problem_names: dict[str, str] = {}
    for analysis in analyses:
        for tag in {item.tag_code: item for item in analysis.personality_tags}.values():
            tag_counts[tag.tag_code] += 1
            tag_names[tag.tag_code] = tag.tag_name
        for problem in {
            item.problem_code: item
            for item in analysis.detected_behavior_problems
            if item.severity != "low"
        }.values():
            problem_counts[problem.problem_code] += 1
            problem_names[problem.problem_code] = problem.problem_name

    count = len(analyses)
    confidence = "low" if count < 3 else "medium" if count < 10 else "high"
    dominant_tags = [
        ProfilePattern(
            code=code,
            name=tag_names[code],
            occurrences=occurrences,
            frequency=round(occurrences / count, 3),
        )
        for code, occurrences in tag_counts.most_common(3)
    ] if count else []
    recurring_problems = [
        ProfilePattern(
            code=code,
            name=problem_names[code],
            occurrences=occurrences,
            frequency=round(occurrences / count, 3),
        )
        for code, occurrences in problem_counts.most_common(3)
    ] if count else []

    if count == 0:
        summary = f"最近{days}天内没有可用交易样本。"
    elif count < 3:
        summary = f"最近{days}天有{count}笔样本，样本较少，暂不判断稳定行为模式。"
    elif dominant_tags:
        summary = (
            f"最近{days}天有{count}笔样本；较常出现的标签是"
            + "、".join(item.name for item in dominant_tags[:2])
            + "。"
        )
    else:
        summary = f"最近{days}天有{count}笔样本，暂未出现重复的行为标签。"

    return ProfileWindow(
        period=period,
        days=days,
        sample_count=count,
        confidence_level=confidence,
        dominant_tags=dominant_tags,
        recurring_problems=recurring_problems,
        summary=summary,
    )


def _parse_trade_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        parsed = datetime.combine(date.fromisoformat(value), time.min)
    return _normalize_datetime(parsed)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)
