from __future__ import annotations

import json
import logging
import math
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.schemas import RagEvidence, StrictModel

router = APIRouter()
logger = logging.getLogger(__name__)
NEW_YORK = ZoneInfo("America/New_York")
ROOT = Path(__file__).resolve().parents[1]


class MarketContextRequest(StrictModel):
    symbol: str = Field(min_length=1, max_length=12, pattern=r"^[A-Za-z][A-Za-z0-9.-]{0,11}$")
    market: Literal["US"] = "US"
    as_of: AwareDatetime
    language: Literal["zh-CN", "ko-KR"] = "zh-CN"
    source: Literal["yahoo", "demo"] = "yahoo"
    focus: Literal["general", "fear_of_missing_out"] = "general"

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.upper().replace(".", "-")

    @field_validator("as_of")
    @classmethod
    def validate_as_of(cls, value: datetime) -> datetime:
        if value.date() < date(1970, 1, 1) or value > datetime.now(timezone.utc):
            raise ValueError("as_of must be between 1970 and the current time, with a timezone offset.")
        return value


class DailyBar(StrictModel):
    date: date
    open: float = Field(gt=0, allow_inf_nan=False)
    high: float = Field(gt=0, allow_inf_nan=False)
    low: float = Field(gt=0, allow_inf_nan=False)
    close: float = Field(gt=0, allow_inf_nan=False)
    volume: int = Field(ge=0)
    split: float = Field(default=0, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_range(self) -> "DailyBar":
        if self.high < max(self.open, self.close) or self.low > min(self.open, self.close):
            raise ValueError("Inconsistent OHLC range.")
        return self


class MarketMetrics(StrictModel):
    last_close: float
    daily_change_pct: float | None
    five_session_change_pct: float | None
    sma20: float | None
    volume_vs_previous20: float | None


class BookNote(StrictModel):
    id: str
    title: str
    content: str
    reflection_question: str
    book: str
    author: str
    publication_year: int
    chapter: str
    source_url: str
    catalog_url: str
    rights_scope: Literal["Public domain in the USA (catalog statement)"]
    content_type: Literal["team_paraphrase_not_quotation"]


class MarketContextResponse(StrictModel):
    symbol: str
    market: Literal["US"] = "US"
    interval: Literal["1d"] = "1d"
    source: Literal["yahoo", "demo"]
    provider: str
    retrieved_at: datetime
    exchange_timezone: Literal["America/New_York"] = "America/New_York"
    cutoff_date_exclusive: date
    data_start: date
    data_end: date
    bar_count: int
    price_basis: str
    metrics: MarketMetrics
    kline_summary: str
    explanation_mode: Literal["calculated_facts_and_curated_notes"] = "calculated_facts_and_curated_notes"
    retrieval_method: Literal["curated_topic_rules"] = "curated_topic_rules"
    book_notes: list[BookNote]
    rag_context: list[RagEvidence]
    warnings: list[str]


class MarketDataError(Exception):
    def __init__(self, code: str, status: int = 502):
        self.code = code
        self.status = status
        super().__init__(code)


def fetch_yahoo_bars(symbol: str, cutoff: date) -> list[DailyBar]:
    """Replaceable adapter: only a symbol/date is sent to the market provider."""
    import yfinance as yf

    yf.set_tz_cache_location(str(ROOT / ".market-cache"))
    # yfinance otherwise swallows provider failures and returns an empty frame.
    yf.config.debug.hide_exceptions = False
    ticker = yf.Ticker(symbol)
    try:
        frame = ticker.history(
            start=(cutoff - timedelta(days=180)).isoformat(),
            end=cutoff.isoformat(), interval="1d", auto_adjust=False,
            back_adjust=False, actions=True, repair=False, timeout=12,
        )
        if frame.empty:
            raise MarketDataError("no_data", 404)
        metadata = ticker.history_metadata
        if (metadata.get("currency") != "USD"
                or metadata.get("exchangeTimezoneName") != "America/New_York"
                or metadata.get("instrumentType") not in {"EQUITY", "ETF"}):
            raise MarketDataError("unsupported_instrument", 422)
        if frame.index.tz is None:
            raise MarketDataError("invalid_data")
        bars = []
        for stamp, row in frame.iterrows():
            day = stamp.tz_convert(NEW_YORK).date()
            if day >= cutoff:
                continue
            # Missing or inconsistent source rows are not interpolated into facts.
            volume = float(row["Volume"])
            if not math.isfinite(volume) or not volume.is_integer():
                raise MarketDataError("invalid_data")
            bars.append(DailyBar(
                date=day, open=row["Open"], high=row["High"], low=row["Low"],
                close=row["Close"], volume=int(volume), split=row.get("Stock Splits", 0),
            ))
        return bars
    except MarketDataError:
        raise
    except Exception as exc:
        logger.warning("Market provider request failed (%s)", type(exc).__name__)
        raise MarketDataError("provider_unavailable") from exc


def demo_bars(cutoff: date) -> list[DailyBar]:
    """Synthetic weekday series, not exchange-calendar or historical prices."""
    days = [cutoff - timedelta(days=i) for i in range(1, 80)]
    days = sorted(day for day in days if day.weekday() < 5)[-30:]
    return [DailyBar(
        date=day, open=100 + i * 0.6, close=100.4 + i * 0.6,
        high=101 + i * 0.6, low=99.3 + i * 0.6, volume=1000000 + i * 10000,
    ) for i, day in enumerate(days)]


@lru_cache(maxsize=1)
def _book_cards() -> dict:
    return json.loads((ROOT / "knowledge" / "selden_1912.json").read_text(encoding="utf-8"))


def select_book_notes(language: str, focus: str) -> list[BookNote]:
    library = _book_cards()
    return [BookNote(**library["source"], id=card["id"], chapter=card["chapter"], **card[language])
            for card in library["cards"] if "general" in card["topics"] or focus in card["topics"]]


def build_market_context(req: MarketContextRequest, bars: list[DailyBar]) -> MarketContextResponse:
    ko = req.language == "ko-KR"
    cutoff = req.as_of.astimezone(NEW_YORK).date()
    usable = sorted((bar for bar in bars if cutoff - timedelta(days=180) <= bar.date < cutoff), key=lambda bar: bar.date)
    if not usable:
        raise MarketDataError("no_data", 404)
    if len({bar.date for bar in usable}) != len(usable):
        raise MarketDataError("invalid_data")
    warnings = [
        "매수일 당일과 이후 봉은 제외했습니다. 일봉으로 장중 상황이나 매수 이유를 알 수 없습니다."
        if ko else "已排除买入当天及之后的日 K；日 K 不能还原盘中状态，也不能证明买入动机。",
        "책 노트는 역사적 관점의 자체 요약이며 현대 실증 연구나 매매 신호가 아닙니다."
        if ko else "书籍卡是历史观点的自行概括，不代表现代实证结论或买卖信号。",
    ]
    if req.source == "demo":
        warnings.insert(0, "합성 데모 가격이며 실제 시세나 거래일 달력이 아닙니다." if ko else "合成演示价格，不是真实行情，也未套用交易所节假日日历。")
    else:
        warnings.append("현재 제공되는 과거 데이터이며 당시 원본 보관본은 아닙니다. 공급자의 수정·분할 반영이 있을 수 있습니다." if ko else "这是当前供应商提供的历史数据，不是当时留存的原始快照，可能包含后续修订或拆股调整。")
        warnings.append("거래일 달력의 완전성은 검증하지 않았으며 변동률은 조회된 일봉 간격으로 계산합니다." if ko else "尚未核验交易日日历完整性，涨幅按已取得的日 K 间隔计算。")
    # Avoid comparing observations across a known split boundary.
    splits = [i for i, bar in enumerate(usable) if bar.split not in {0, 1}]
    if splits:
        usable = usable[splits[-1]:]
        warnings.append("분할 이전 봉은 계산에서 제외했습니다." if ko else "检测到拆股，计算已排除最近一次拆股之前的日 K。")
    if (cutoff - usable[-1].date).days > 7:
        warnings.append("최근 봉이 매수일보다 7일 이상 오래되었습니다. 거래정지·누락 여부를 확인하세요." if ko else "最近一根日 K 距买入日超过 7 天，请核对停牌或数据缺失。")
    if len(usable) < 21:
        warnings.append("표본이 부족한 지표는 비워 둡니다." if ko else "样本不足的指标留空，不补造历史数据。")
    last = usable[-1]
    volume_mean = sum(bar.volume for bar in usable[-21:-1]) / 20 if len(usable) >= 21 else 0
    metrics = MarketMetrics(
        last_close=round(last.close, 4),
        daily_change_pct=round((last.close / usable[-2].close - 1) * 100, 4) if len(usable) >= 2 else None,
        five_session_change_pct=round((last.close / usable[-6].close - 1) * 100, 4) if len(usable) >= 6 else None,
        sma20=round(sum(bar.close for bar in usable[-20:]) / 20, 4) if len(usable) >= 20 else None,
        volume_vs_previous20=round(last.volume / volume_mean, 4) if volume_mean > 0 else None,
    )
    origin = ("합성 데모" if ko else "合成演示") if req.source == "demo" else "Yahoo Finance"
    def number(value: float | None, suffix: str = "") -> str:
        return ("자료 부족" if ko else "数据不足") if value is None else f"{value:.2f}{suffix}"
    summary = (
        f"[{origin}] {req.symbol} | {usable[0].date} ~ {last.date} | {len(usable)} "
        + ("개 일봉. " if ko else "根日 K。")
        + (f"마지막 종가 {last.close:.2f} USD; 전일 대비 {number(metrics.daily_change_pct, '%')}; "
           f"5거래일 변동 {number(metrics.five_session_change_pct, '%')}; 20일 평균 종가 {number(metrics.sma20)}; "
           f"거래량/직전 20일 평균 {number(metrics.volume_vs_previous20, 'x')}. " if ko else
           f"最后收盘 {last.close:.2f} USD；单日变化 {number(metrics.daily_change_pct, '%')}；"
           f"5 个交易日变化 {number(metrics.five_session_change_pct, '%')}；20 日收盘均值 {number(metrics.sma20)}；"
           f"成交量/此前 20 日均量 {number(metrics.volume_vs_previous20, '倍')}。")
        + " ".join(warnings)
    )
    notes = select_book_notes(req.language, req.focus)
    return MarketContextResponse(
        symbol=req.symbol, source=req.source, provider=origin, retrieved_at=datetime.now(timezone.utc),
        cutoff_date_exclusive=cutoff, data_start=usable[0].date, data_end=last.date, bar_count=len(usable),
        price_basis="provider OHLC; auto_adjust=False; not a point-in-time archive" if req.source == "yahoo" else "synthetic demonstration",
        metrics=metrics, kline_summary=summary, book_notes=notes, warnings=warnings,
        rag_context=[RagEvidence(source=f"G. C. Selden (1912), {note.chapter}", title=note.title,
                                content=f"{note.content}\n{note.reflection_question}\n{note.source_url}") for note in notes],
    )


ERRORS = {
    "no_data": ("未取得该日期之前的日 K，请检查股票代码或上市日期。", "해당 날짜 이전 일봉이 없습니다. 종목 코드와 상장일을 확인하세요."),
    "unsupported_instrument": ("首版仅支持美国市场、美元计价的股票或 ETF。", "첫 버전은 미국 시장의 USD 주식과 ETF만 지원합니다."),
    "invalid_data": ("行情数据不完整或不一致，未生成摘要。", "시세 데이터가 불완전하거나 일관되지 않아 요약하지 않았습니다."),
    "provider_unavailable": ("行情源暂时不可用，请稍后重试；未替换为演示数据。", "시세 공급원에 연결하지 못했습니다. 데모 데이터로 대체하지 않았습니다."),
}


@router.post("/analyze-market-context", response_model=MarketContextResponse)
def analyze_market_context(req: MarketContextRequest) -> MarketContextResponse:
    cutoff = req.as_of.astimezone(NEW_YORK).date()
    try:
        bars = demo_bars(cutoff) if req.source == "demo" else fetch_yahoo_bars(req.symbol, cutoff)
        return build_market_context(req, bars)
    except MarketDataError as exc:
        raise HTTPException(status_code=exc.status, detail={
            "code": exc.code, "message": ERRORS[exc.code][req.language == "ko-KR"],
        }) from exc
