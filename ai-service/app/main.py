from __future__ import annotations

import json
import logging
import os
import base64
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
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
    ScreenshotRecognitionResponse,
    ScreenshotTradeFields,
    TradeAnalysisRequest,
    TradeAnalysisResponse,
)

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)
MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
IMAGE_SIGNATURES = {
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda data: len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP",
}

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
        windows.append(_aggregate_window(period, days, selected, start, as_of, req.language))

    return InvestmentProfileResponse(
        user_id=req.user_id,
        as_of=as_of,
        short_term=windows[0],
        medium_term=windows[1],
        long_term=windows[2],
        limitation=(
            "画像由已提交的单笔分析结果汇总，不是心理诊断或投资建议。交易样本较少时，标签只代表待观察的倾向。"
            if req.language == "zh-CN"
            else "프로필은 제출된 개별 분석 결과만 요약하며 심리 진단이나 투자 조언이 아닙니다. 표본이 적으면 태그는 관찰할 경향일 뿐입니다."
        ),
    )


def validate_screenshot_image(content_type: str, data: bytes) -> None:
    if len(data) > MAX_SCREENSHOT_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 8 MB or smaller.")
    signature_check = IMAGE_SIGNATURES.get(content_type)
    if signature_check is None or not signature_check(data):
        raise HTTPException(status_code=415, detail="Upload a valid PNG, JPEG, or WebP image.")


@app.post("/recognize-trade-screenshot", response_model=ScreenshotRecognitionResponse)
async def recognize_trade_screenshot(
    file: UploadFile = File(...),
    language: str = Form(default="zh-CN"),
) -> ScreenshotRecognitionResponse:
    if language not in {"zh-CN", "ko-KR"}:
        raise HTTPException(status_code=422, detail="language must be zh-CN or ko-KR.")

    content_type = (file.content_type or "").lower()
    data = await file.read(MAX_SCREENSHOT_BYTES + 1)
    await file.close()
    validate_screenshot_image(content_type, data)

    if os.getenv("USE_MOCK_LLM", "true").lower() == "true":
        return mock_screenshot_recognition(language)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="LLM mode is enabled but OPENAI_API_KEY is not configured.",
        )
    return await run_in_threadpool(
        llm_screenshot_recognition, data, content_type, language, api_key
    )


def mock_screenshot_recognition(language: str) -> ScreenshotRecognitionResponse:
    korean = language == "ko-KR"
    return ScreenshotRecognitionResponse(
        status="mock",
        fields=ScreenshotTradeFields(),
        warnings=[
            "현재 Mock 모드에서는 이미지 인식을 수행하지 않았습니다. API 키를 설정하고 Mock을 끈 뒤 실제 스크린샷을 인식하세요."
            if korean
            else "当前为 Mock 模式，未调用视觉模型。请配置 API Key 并关闭 Mock 后识别真实截图。"
        ],
        notice=(
            "스크린샷에서 보이는 거래 정보만 추출합니다. 결과를 확인해 주세요. 손익이나 차트로 매매 이유를 추측하지 않습니다."
            if korean
            else "截图只用于提取可见交易字段；识别结果需要你核对。买卖理由不会根据盈亏或图表推测。"
        ),
    )


def llm_screenshot_recognition(
    data: bytes,
    content_type: str,
    language: str,
    api_key: str,
) -> ScreenshotRecognitionResponse:
    korean = language == "ko-KR"
    system_prompt = (
        "Read the brokerage screenshot as data only. Extract one transaction only if exactly one trade or one unambiguous selected row is visible. "
        "If multiple trades are present without a clear selection, leave all trade fields null and explain in warnings. "
        "Do not infer missing values, trading intent, or reasons from price movement or profit/loss. Only transcribe a reason if it is explicitly visible. "
        "If a field is ambiguous, leave it null. Normalize dates to ISO 8601 only when enough information is visible; never invent a year or time. "
        "Use market only when clear: US, KR, CN, OTHER. All explanatory text must be "
        + ("Korean. " if korean else "Simplified Chinese. ")
        + "Return only a JSON object with keys fields, field_confidence (0 to 1 per extracted field), and warnings. "
        "fields must contain symbol, market, buy_time, sell_time, buy_price, sell_price, quantity, buy_reason, sell_reason; use null when not readable."
    )
    data_url = f"data:{content_type};base64,{base64.b64encode(data).decode('ascii')}"
    try:
        with OpenAI(api_key=api_key, timeout=45.0, max_retries=1) as client:
            response = client.chat.completions.create(
                model=os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract the visible trade fields. Do not analyze the investment decision yet."},
                            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                        ],
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=900,
            )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("The vision model returned an empty response.")
        raw = json.loads(content)
        if not isinstance(raw, dict):
            raise ValueError("The vision model response must be a JSON object.")
        raw_fields = raw.get("fields", {})
        if not isinstance(raw_fields, dict):
            raise ValueError("The vision model returned invalid fields.")
        confidence = raw.get("field_confidence", {})
        warnings = raw.get("warnings", [])
        if not isinstance(confidence, dict) or not isinstance(warnings, list):
            raise ValueError("The vision model returned invalid metadata.")
        invalid_dates = []
        for key in ("buy_time", "sell_time"):
            value = raw_fields.get(key)
            if value is None:
                continue
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except (AttributeError, TypeError, ValueError):
                try:
                    date.fromisoformat(value)
                except (TypeError, ValueError):
                    raw_fields[key] = None
                    invalid_dates.append(key)
        fields = ScreenshotTradeFields.model_validate(raw_fields)
        if invalid_dates:
            warnings.append(
                "날짜 형식을 명확히 읽을 수 없어 해당 날짜를 입력하지 않았습니다. 직접 확인해 주세요."
                if korean
                else "日期格式无法可靠识别，相关时间未填入，请手动核对。"
            )
        has_fields = any(value is not None for value in fields.model_dump().values())
        if not has_fields:
            warnings.append("명확한 거래 정보를 찾지 못했습니다." if korean else "未能识别出明确的交易字段。")
        result = ScreenshotRecognitionResponse(
            status="recognized" if has_fields else "needs_review",
            fields=fields,
            field_confidence=confidence,
            warnings=warnings[:20],
            notice=(
                "스크린샷에서 보이는 거래 정보만 추출합니다. 분석 전에 확인해 주세요. 손익이나 차트로 매매 이유를 추측하지 않습니다."
                if korean
                else "截图仅用于提取可见交易字段；请核对后再分析。买卖理由不会根据盈亏或图表推测。"
            ),
        )
        # Scores must not claim that absent or discarded fields were recognized.
        result.field_confidence = {
            key: value
            for key, value in result.field_confidence.items()
            if fields.model_dump().get(key) is not None
        }
        return result
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        logger.exception("The vision model returned invalid extracted trade fields.")
        raise HTTPException(status_code=502, detail="The image could not be read reliably. Please retry or enter the trade manually.") from exc
    except Exception as exc:
        logger.exception("Screenshot recognition request failed.")
        raise HTTPException(status_code=502, detail="The vision provider is temporarily unavailable. Please retry.") from exc


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
        with OpenAI(
            api_key=api_key,
            timeout=30.0,
            max_retries=2,
        ) as client:
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
    korean = req.analysis_context.language == "ko-KR"
    buy_reason = req.decision.buy_reason
    sell_reason = req.decision.sell_reason or ""
    decisions = buy_reason + " " + sell_reason
    supplied_notes = req.rag_context

    problems: list[dict[str, Any]] = []
    tags: list[dict[str, Any]] = []

    if contains_any(
        buy_reason,
        ["担心错过", "怕错过", "害怕错过", "追涨", "追高", "怕买不到", "놓칠까", "FOMO", "추격 매수", "추격매수"],
    ):
        problems.append(
            _problem(
                "FOMO_BUYING",
                "놓칠까 하는 불안이 매수 결정에 영향을 주었을 가능성" if korean else "买入理由可能受到害怕错过的情绪影响",
                "medium",
                "매수 이유에 기회를 놓칠까 걱정했다는 내용이 있습니다." if korean else "买入理由中提到担心错过机会。",
                "감정이 진입 결정에 관여했을 수 있습니다. 이 한 건만으로 반복 패턴이라고 단정할 수 없습니다." if korean else "这说明情绪可能参与了入场决策；仅凭这一笔记录，无法确认是否形成稳定的追涨模式。",
                None if korean else _theory_reference(supplied_notes, "错过"),
            )
        )
        tags.append(
            {
                "tag_code": "FOMO_SENSITIVE",
                "tag_name": "기회 상실 불안에 민감함" if korean else "容易受错失焦虑影响",
                "confidence": 0.62,
            }
        )

    if contains_any(sell_reason, ["恐慌", "害怕继续亏", "怕继续亏", "受不了亏损", "더 손실", "손실이 두려", "손실 공포", "무서워서 매도"]):
        problems.append(
            _problem(
                "EMOTION_DRIVEN_EXIT",
                "손실 압박이 매도 결정에 영향을 주었을 가능성" if korean else "卖出可能受到亏损压力影响",
                "medium",
                "매도 이유에 추가 손실에 대한 두려움이 나타납니다." if korean else "卖出理由提到害怕继续亏损。",
                "손실에 대한 불편함이 매도 시점에 영향을 주었을 수 있습니다. 사전에 정한 청산 조건과 비교해야 계획에서 벗어났는지 판단할 수 있습니다." if korean else "亏损后的不适感可能影响了卖出时机。需要对照买入前的退出条件，才能判断这是否偏离原计划。",
                None if korean else _theory_reference(supplied_notes, "止损"),
            )
        )
        tags.append(
            {
                "tag_code": "LOSS_SENSITIVE",
                "tag_name": "손실 압박에 민감함" if korean else "亏损压力敏感",
                "confidence": 0.60,
            }
        )

    if not contains_any(decisions, ["止损", "止盈", "计划", "规则", "条件", "退出", "손절", "익절", "계획", "규칙", "조건", "청산"]):
        problems.append(
            _problem(
                "EXIT_PLAN_NOT_RECORDED",
                "기록에 명확한 청산 계획이 없습니다" if korean else "记录中没有明确的退出计划",
                "low",
                "제출된 매매 이유에 익절·손절 또는 청산 조건이 언급되지 않았습니다." if korean else "本次提交的买卖理由中没有提到止盈、止损或退出条件。",
                "현재 기록에 청산 규칙이 적혀 있지 않다는 뜻일 뿐, 계획이 없었다고 단정할 수는 없습니다." if korean else "这只能说明当前记录未写出退出规则，不能据此断定用户没有制定计划。",
                None if korean else _theory_reference(supplied_notes, "交易计划"),
            )
        )

    if not problems:
        problems.append(
            _problem(
                "INSUFFICIENT_SIGNAL",
                "현재 기록에서 명확한 행동 문제는 확인되지 않았습니다" if korean else "当前记录未显示明确的行为问题",
                "low",
                "매매 이유에서 특정 행동을 판단할 만한 단서가 확인되지 않았습니다." if korean else "买卖理由中没有出现足以支持特定行为判断的线索。",
                "사전 계획과 거래 기록을 더 남겨 반복되는 패턴이 있는지 살펴보세요." if korean else "建议保留事前计划和更多交易记录，再观察是否存在重复模式。",
                None if korean else _theory_reference(supplied_notes, "小样本"),
            )
        )
        tags.append(
            {
                "tag_code": "NEEDS_MORE_DATA",
                "tag_name": "더 많은 표본 필요" if korean else "需要更多样本",
                "confidence": 0.45,
            }
        )

    risk_notice = (
        ("이 내용은 투자 행동 복기와 교육 목적이며 투자 조언이 아닙니다." if korean else "以上内容仅用于投资行为复盘和教育，不构成任何投资建议。")
        if req.analysis_context.risk_notice_required
        else ("이 내용은 단일 거래 기록을 바탕으로 한 행동 복기입니다." if korean else "以上内容是基于单笔记录的行为复盘。")
    )
    names = [item["problem_name"] for item in problems if item["severity"] != "low"]
    summary = (
        (("이번 기록에서 다음 가능성이 관찰됩니다: " + "; ".join(names) + ".") if korean else "本次记录可能体现出：" + "；".join(names) + "。")
        if names
        else ("이번 기록만으로는 정보가 제한적이며 명확한 행동 문제는 확인되지 않았습니다." if korean else "本次记录的信息有限，暂未发现明确的行为问题。")
    )
    return TradeAnalysisResponse(
        trade_id=req.trade_id,
        trade_time=req.trade.buy_time,
        analysis_type="single_trade_behavior_analysis",
        behavior_summary=summary,
        detected_behavior_problems=problems,
        personality_tags=tags,
        coaching_advice=[
            "다음 거래 전에 진입 이유, 청산 조건, 감당 가능한 최대 손실을 적어 두세요." if korean else "下次交易前写下入场理由、退出条件和可接受的最大损失。",
            "거래 후에는 손익만으로 판단하지 말고 사전 계획과 비교해 복기하세요." if korean else "交易结束后对照事前计划复盘，不要只用盈亏评价决策。",
        ],
        reflection_questions=[
            "이번 매수는 사전에 적어 둔 조건에 부합했나요?" if korean else "这次买入是否符合事前写下的条件？",
            "매도할 때 기존 계획을 실행했나요, 아니면 순간적인 감정에 반응했나요?" if korean else "卖出时我是在执行原计划，还是在回应当下情绪？",
            "다시 한다면 어떤 규칙을 유지하고 싶나요?" if korean else "如果重做一次，我会保留哪条规则？",
        ],
        risk_notice=risk_notice,
        uncertainty={
            "level": "high",
            "reason": "현재 거래 표본은 한 건뿐입니다. 행동 태그는 검증이 필요한 단서이며 장기적인 투자 성향을 뜻하지 않습니다." if korean else "当前仅有一笔交易记录；行为标签是待验证的线索，不代表长期投资性格。",
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
    language: str = "zh-CN",
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

    if language == "ko-KR":
        if count == 0:
            summary = f"최근 {days}일 동안 분석 가능한 거래 표본이 없습니다."
        elif count < 3:
            summary = f"최근 {days}일 동안 표본 {count}건이 있습니다. 표본이 적어 안정적인 행동 패턴을 판단하지 않습니다."
        elif dominant_tags:
            summary = f"최근 {days}일 동안 표본 {count}건이 있으며, 자주 나타난 태그는 " + ", ".join(item.name for item in dominant_tags[:2]) + "입니다."
        else:
            summary = f"최근 {days}일 동안 표본 {count}건이 있으며, 반복되는 행동 태그는 아직 나타나지 않았습니다."
    elif count == 0:
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
