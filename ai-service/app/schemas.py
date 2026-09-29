from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.executions import summarize_executions
from app.trade_times import time_precision


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Stock(StrictModel):
    symbol: str = Field(min_length=1, max_length=24)
    name: str | None = Field(default=None, max_length=120)
    market: str | None = Field(default=None, max_length=24)


class Execution(StrictModel):
    execution_id: str = Field(min_length=1, max_length=100)
    side: Literal["buy", "sell"]
    time: str = Field(min_length=1, max_length=40)
    price: float = Field(ge=0.00000001, le=1_000_000_000_000, allow_inf_nan=False)
    quantity: int = Field(gt=0, le=100_000_000, strict=True)
    reason: str | None = Field(default=None, max_length=1_000)

    @field_validator("time")
    @classmethod
    def preserve_time_precision(cls, value: str) -> str:
        time_precision(value)
        return value


class ExecutionStep(Execution):
    occurrence: int
    remaining_quantity: int
    realized_profit_loss: float | None


class ExecutionSummary(StrictModel):
    ordering_basis: Literal["timestamp", "recorded_date_or_local_time", "recorded_date_and_confirmed_sequence"] = "timestamp"
    accounting_method: Literal["moving_weighted_average_excluding_fees_taxes_fx"]
    buy_count: int
    sell_count: int
    total_bought: int
    total_sold: int
    remaining_quantity: int
    average_buy_price: float
    average_sell_price: float | None
    remaining_cost_basis: float
    remaining_average_cost: float | None
    realized_profit_loss: float | None
    realized_profit_loss_rate: float | None
    timeline: list[ExecutionStep]


class Trade(StrictModel):
    execution_order_confirmed: bool = False
    executions: list[Execution] | None = Field(default=None, min_length=1, max_length=100)
    buy_time: str = Field(min_length=1, max_length=40)
    sell_time: str | None = Field(default=None, max_length=40)
    buy_price: float = Field(gt=0, allow_inf_nan=False)
    sell_price: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    quantity: int = Field(gt=0, le=100_000_000)
    profit_loss_amount: float | None = Field(default=None, allow_inf_nan=False)
    profit_loss_rate: float | None = Field(default=None, allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def derive_execution_totals(cls, value):
        if not isinstance(value, dict) or value.get("executions") is None:
            return value
        entries = value["executions"]
        if not isinstance(entries, list) or not 1 <= len(entries) <= 100:
            raise ValueError("executions must contain between 1 and 100 records.")
        parsed = [Execution.model_validate(row).model_dump() for row in entries]
        summary = summarize_executions(parsed, value.get("execution_order_confirmed") is True)
        buys = [row for row in summary["timeline"] if row["side"] == "buy"]
        sells = [row for row in summary["timeline"] if row["side"] == "sell"]
        return {**value, "executions": parsed,
                "buy_time": buys[0]["time"], "sell_time": sells[-1]["time"] if sells else None,
                "buy_price": summary["average_buy_price"], "sell_price": summary["average_sell_price"],
                "quantity": summary["total_bought"], "profit_loss_amount": summary["realized_profit_loss"],
                "profit_loss_rate": summary["realized_profit_loss_rate"]}

    @computed_field
    @property
    def execution_summary(self) -> ExecutionSummary | None:
        if not self.executions:
            return None
        return ExecutionSummary.model_validate(summarize_executions([row.model_dump() for row in self.executions], self.execution_order_confirmed))

    @field_validator("buy_time", "sell_time")
    @classmethod
    def validate_trade_time(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        normalized = value.replace("Z", "+00:00")
        try:
            datetime.fromisoformat(normalized)
        except ValueError:
            date.fromisoformat(value)
        return value

    @model_validator(mode="after")
    def validate_closed_trade(self) -> "Trade":
        if (self.sell_time is None) != (self.sell_price is None):
            raise ValueError("sell_time and sell_price must either both be set or both be empty.")
        if self.sell_time is not None:
            buy_at = _parse_iso_time(self.buy_time)
            sell_at = _parse_iso_time(self.sell_time)
            comparable = time_precision(self.buy_time) == time_precision(self.sell_time)
            if (comparable and sell_at < buy_at) or (not comparable and self.sell_time[:10] < self.buy_time[:10]):
                raise ValueError("sell_time must not be earlier than buy_time.")
        return self


class Decision(StrictModel):
    buy_reason: str | None = Field(default=None, max_length=1_000)
    sell_reason: str | None = Field(default=None, max_length=1_000)
    confidence_level: int | None = Field(default=None, ge=1, le=5)
    planned_holding_period: str | None = Field(default=None, max_length=80)
    actual_holding_period_minutes: int | None = Field(default=None, ge=0)

    @field_validator("buy_reason", mode="before")
    @classmethod
    def require_nonblank_buy_reason(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip() or None
        return value


class MarketSnapshot(StrictModel):
    trend_before_buy: str | None = Field(default=None, max_length=1_000)
    volume_price_summary: str | None = Field(default=None, max_length=1_000)
    kline_summary: str | None = Field(default=None, max_length=2_000)
    news_summary: str | None = Field(default=None, max_length=1_000)


class AnalysisContext(StrictModel):
    language: Literal["zh-CN", "ko-KR"] = "zh-CN"
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
    execution_summary: ExecutionSummary | None = None
    trade_id: str = Field(min_length=1, max_length=100)
    trade_time: str = Field(min_length=1, max_length=40)
    analysis_type: Literal["single_trade_behavior_analysis"]
    behavior_summary: str
    detected_behavior_problems: list[BehaviorProblem]
    personality_tags: list[PersonalityTag]
    coaching_advice: list[str]
    reflection_questions: list[str]
    risk_notice: str
    uncertainty: Uncertainty

    @field_validator("trade_time")
    @classmethod
    def validate_trade_time(cls, value: str) -> str:
        value = value.strip()
        _parse_iso_time(value)
        return value


class ProfileRequest(StrictModel):
    user_id: str = Field(min_length=1, max_length=100)
    language: Literal["zh-CN", "ko-KR"] = "zh-CN"
    trade_analyses: list[TradeAnalysisResponse] = Field(min_length=1, max_length=500)
    as_of: datetime | None = None

    @field_validator("trade_analyses")
    @classmethod
    def require_unique_trade_ids(
        cls, analyses: list[TradeAnalysisResponse]
    ) -> list[TradeAnalysisResponse]:
        trade_ids = [item.trade_id for item in analyses]
        if len(trade_ids) != len(set(trade_ids)):
            raise ValueError("trade_analyses must not contain duplicate trade_id values.")
        return analyses


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


class ScreenshotTradeFields(StrictModel):
    symbol: str | None = Field(default=None, max_length=24)
    market: Literal["US", "KR", "CN", "OTHER"] | None = None
    buy_time: str | None = Field(default=None, max_length=40)
    sell_time: str | None = Field(default=None, max_length=40)
    buy_price: float | None = Field(default=None, gt=0, allow_inf_nan=False, description="Only a visibly printed per-unit buy execution price. Null when only gross amount and quantity are shown. Never calculate this field.")
    sell_price: float | None = Field(default=None, gt=0, allow_inf_nan=False, description="Only a visibly printed per-unit sell execution price. Null when only gross amount and quantity are shown. Never calculate this field.")
    quantity: int | None = Field(default=None, gt=0, le=100_000_000, description="Only visibly printed executed share quantity; null if not shown. Never calculate this field.")
    buy_reason: str | None = Field(default=None, max_length=1_000)
    sell_reason: str | None = Field(default=None, max_length=1_000)

    @field_validator("symbol", "market", "buy_time", "sell_time", "buy_reason", "sell_reason", mode="before")
    @classmethod
    def normalize_empty_fields(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("buy_time", "sell_time")
    @classmethod
    def validate_optional_time(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.replace("Z", "+00:00")
        try:
            datetime.fromisoformat(normalized)
        except ValueError:
            date.fromisoformat(value)
        return value


class ScreenshotRecord(StrictModel):
    kind: Literal["security_trade", "cash_flow", "unknown"] = "unknown"
    label: str | None = Field(default=None, max_length=120)
    side: Literal["buy", "sell", "round_trip", "unknown"] = "unknown"


class ScreenshotDetails(StrictModel):
    stock_name: str | None = Field(default=None, max_length=120)
    currency: str | None = Field(default=None, max_length=12)
    gross_amount: float | None = Field(default=None, gt=0, le=1e20, allow_inf_nan=False)
    fee: float | None = Field(default=None, ge=0, le=1e20, allow_inf_nan=False)
    tax: float | None = Field(default=None, ge=0, le=1e20, allow_inf_nan=False)


class ScreenshotRecognitionResponse(StrictModel):
    details: ScreenshotDetails = Field(default_factory=ScreenshotDetails)
    derived_fields: list[Literal["buy_price", "sell_price", "quantity"]] = Field(default_factory=list)
    status: Literal["recognized", "not_trade", "needs_review", "mock"]
    record: ScreenshotRecord = Field(default_factory=ScreenshotRecord)
    fields: ScreenshotTradeFields
    field_confidence: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list, max_length=20)
    notice: str

    @field_validator("field_confidence")
    @classmethod
    def validate_confidence(cls, value: dict[str, float]) -> dict[str, float]:
        if any(not 0 <= score <= 1 for score in value.values()):
            raise ValueError("field confidence values must be between 0 and 1.")
        return value


def _parse_iso_time(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        parsed = datetime.combine(date.fromisoformat(value), datetime.min.time())
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
