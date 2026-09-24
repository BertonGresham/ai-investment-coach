from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Stock(StrictModel):
    symbol: str = Field(min_length=1, max_length=24)
    name: str | None = Field(default=None, max_length=120)
    market: str | None = Field(default=None, max_length=24)


class Trade(StrictModel):
    buy_time: str = Field(min_length=1, max_length=40)
    sell_time: str | None = Field(default=None, max_length=40)
    buy_price: float = Field(gt=0, allow_inf_nan=False)
    sell_price: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    quantity: int = Field(gt=0, le=100_000_000)
    profit_loss_amount: float | None = Field(default=None, allow_inf_nan=False)
    profit_loss_rate: float | None = Field(default=None, allow_inf_nan=False)

    @field_validator("buy_time", "sell_time")
    @classmethod
    def validate_trade_time(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.replace("Z", "+00:00")
        try:
            datetime.fromisoformat(normalized)
        except ValueError:
            date.fromisoformat(value)
        return value


class Decision(StrictModel):
    buy_reason: str = Field(min_length=1, max_length=1_000)
    sell_reason: str | None = Field(default=None, max_length=1_000)
    confidence_level: int | None = Field(default=None, ge=1, le=5)
    planned_holding_period: str | None = Field(default=None, max_length=80)
    actual_holding_period_minutes: int | None = Field(default=None, ge=0)

    @field_validator("buy_reason", mode="before")
    @classmethod
    def require_nonblank_buy_reason(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip()
        return value


class MarketSnapshot(StrictModel):
    trend_before_buy: str | None = Field(default=None, max_length=1_000)
    volume_price_summary: str | None = Field(default=None, max_length=1_000)
    kline_summary: str | None = Field(default=None, max_length=2_000)
    news_summary: str | None = Field(default=None, max_length=1_000)


class AnalysisContext(StrictModel):
    language: str = Field(default="zh-CN", max_length=16)
    analysis_goal: str = Field(
        default="Analyze investment decision behavior, not future stock direction.",
        max_length=300,
    )
    risk_notice_required: bool = True


class RagEvidence(StrictModel):
    source: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=2_000)
    score: float | None = Field(default=None, ge=0, le=1)


class TradeAnalysisRequest(StrictModel):
    user_id: str = Field(min_length=1, max_length=100)
    trade_id: str = Field(min_length=1, max_length=100)
    stock: Stock
    trade: Trade
    decision: Decision
    market_snapshot: MarketSnapshot = Field(default_factory=MarketSnapshot)
    analysis_context: AnalysisContext = Field(default_factory=AnalysisContext)
    rag_context: list[RagEvidence] = Field(default_factory=list, max_length=5)


class BehaviorProblem(StrictModel):
    problem_code: str
    problem_name: str
    severity: Literal["low", "medium", "high"]
    evidence: str
    explanation: str
    theory_reference: str | None = None


class PersonalityTag(StrictModel):
    tag_code: str
    tag_name: str
    confidence: float = Field(ge=0, le=1)


class Uncertainty(StrictModel):
    level: Literal["low", "medium", "high"]
    reason: str


class TradeAnalysisResponse(StrictModel):
    trade_id: str
    trade_time: str
    analysis_type: Literal["single_trade_behavior_analysis"]
    behavior_summary: str
    detected_behavior_problems: list[BehaviorProblem]
    personality_tags: list[PersonalityTag]
    coaching_advice: list[str]
    reflection_questions: list[str]
    risk_notice: str
    uncertainty: Uncertainty


class ProfileRequest(StrictModel):
    user_id: str = Field(min_length=1, max_length=100)
    trade_analyses: list[TradeAnalysisResponse] = Field(min_length=1, max_length=500)
    as_of: datetime | None = None


class ProfilePattern(StrictModel):
    code: str
    name: str
    occurrences: int
    frequency: float = Field(ge=0, le=1)


class ProfileWindow(StrictModel):
    period: Literal["short_term", "medium_term", "long_term"]
    days: int
    sample_count: int
    confidence_level: Literal["low", "medium", "high"]
    dominant_tags: list[ProfilePattern]
    recurring_problems: list[ProfilePattern]
    summary: str


class InvestmentProfileResponse(StrictModel):
    user_id: str
    as_of: datetime
    short_term: ProfileWindow
    medium_term: ProfileWindow
    long_term: ProfileWindow
    limitation: str

