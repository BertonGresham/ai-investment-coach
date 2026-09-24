from datetime import datetime, timezone
import unittest

from pydantic import ValidationError

from app.main import (
    _keep_supported_theory_references,
    analyze_profile,
    mock_behavior_analysis,
)
from app.prompts import build_analysis_payload
from app.schemas import (
    ProfileRequest,
    RagEvidence,
    Trade,
    TradeAnalysisRequest,
    TradeAnalysisResponse,
)


def trade_analysis(trade_id: str, trade_time: str) -> TradeAnalysisResponse:
    return TradeAnalysisResponse(
        trade_id=trade_id,
        trade_time=trade_time,
        analysis_type="single_trade_behavior_analysis",
        behavior_summary="记录到一个待观察的行为线索。",
        detected_behavior_problems=[],
        personality_tags=[
            {
                "tag_code": "FOMO_SENSITIVE",
                "tag_name": "容易受错失焦虑影响",
                "confidence": 0.6,
            }
        ],
        coaching_advice=[],
        reflection_questions=[],
        risk_notice="仅供教育复盘，不构成投资建议。",
        uncertainty={"level": "high", "reason": "单笔交易样本。"},
    )


class BehaviorAnalysisTests(unittest.TestCase):
    def test_mock_analysis_uses_buy_and_sell_reason_evidence(self) -> None:
        request = TradeAnalysisRequest(
            user_id="user-1",
            trade_id="trade-1",
            stock={"symbol": "AAPL"},
            trade={
                "buy_time": "2025-07-25T10:15:00",
                "sell_time": "2025-07-25T14:40:00",
                "buy_price": 218.5,
                "sell_price": 213.2,
                "quantity": 10,
            },
            decision={
                "buy_reason": "担心错过机会，所以追涨买入",
                "sell_reason": "害怕继续亏损，所以卖出",
            },
        )

        result = mock_behavior_analysis(request)

        self.assertEqual(result.trade_id, "trade-1")
        self.assertEqual(
            {tag.tag_code for tag in result.personality_tags},
            {"FOMO_SENSITIVE", "LOSS_SENSITIVE"},
        )
        severity_by_code = {
            problem.problem_code: problem.severity
            for problem in result.detected_behavior_problems
        }
        self.assertEqual(severity_by_code["FOMO_BUYING"], "medium")
        self.assertEqual(severity_by_code["EMOTION_DRIVEN_EXIT"], "medium")
        self.assertEqual(severity_by_code["EXIT_PLAN_NOT_RECORDED"], "low")
        self.assertEqual(result.uncertainty.level, "high")

    def test_analysis_prompt_omits_user_and_stock_identifiers(self) -> None:
        request = TradeAnalysisRequest(
            user_id="private-user",
            trade_id="trade-1",
            stock={"symbol": "PRIVATE-TICKER", "name": "Private Company"},
            trade={"buy_time": "2025-07-25", "buy_price": 10, "quantity": 1},
            decision={"buy_reason": "按预设条件买入"},
        )

        payload = build_analysis_payload(request, [])

        self.assertNotIn("user_id", payload)
        self.assertNotIn("stock", payload)
        self.assertNotIn("PRIVATE-TICKER", str(payload))
        self.assertNotIn("Private Company", str(payload))

    def test_trade_rejects_unpaired_sell_fields_and_reversed_times(self) -> None:
        with self.assertRaises(ValidationError):
            Trade(
                buy_time="2025-07-25T10:00:00",
                buy_price=10,
                sell_price=11,
                quantity=1,
            )
        with self.assertRaises(ValidationError):
            Trade(
                buy_time="2025-07-25T10:00:00",
                sell_time="2025-07-25T09:00:00",
                buy_price=10,
                sell_price=11,
                quantity=1,
            )

    def test_profile_counts_only_samples_in_each_window(self) -> None:
        request = ProfileRequest(
            user_id="user-1",
            as_of=datetime(2025, 7, 25, tzinfo=timezone.utc),
            trade_analyses=[
                trade_analysis("t1", "2025-07-24T10:00:00Z"),
                trade_analysis("t2", "2025-07-10T10:00:00Z"),
                trade_analysis("t3", "2025-05-01T10:00:00Z"),
            ],
        )

        result = analyze_profile(request)

        self.assertEqual(result.short_term.sample_count, 1)
        self.assertEqual(result.medium_term.sample_count, 2)
        self.assertEqual(result.long_term.sample_count, 3)
        self.assertEqual(result.short_term.confidence_level, "low")
        self.assertEqual(result.long_term.confidence_level, "medium")

    def test_profile_rejects_duplicate_trade_ids_and_invalid_times(self) -> None:
        with self.assertRaises(ValidationError):
            ProfileRequest(
                user_id="user-1",
                trade_analyses=[
                    trade_analysis("duplicate", "2025-07-24"),
                    trade_analysis("duplicate", "2025-07-23"),
                ],
            )
        with self.assertRaises(ValidationError):
            trade_analysis("bad-time", "not-a-date")

    def test_model_cannot_claim_an_unretrieved_theory_source(self) -> None:
        notes = [
            RagEvidence(source="团队知识卡", title="先定义交易计划", content="事前写明退出条件。")
        ]
        result = {
            "detected_behavior_problems": [
                {"theory_reference": "编造书籍（虚构作者）"},
                {"theory_reference": "先定义交易计划（团队知识卡）"},
            ]
        }

        _keep_supported_theory_references(result, notes)

        self.assertIsNone(result["detected_behavior_problems"][0]["theory_reference"])
        self.assertEqual(
            result["detected_behavior_problems"][1]["theory_reference"],
            "先定义交易计划（团队知识卡）",
        )


if __name__ == "__main__":
    unittest.main()
