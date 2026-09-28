import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, mock_behavior_analysis
from app.prompts import build_analysis_payload
from app.schemas import Trade, TradeAnalysisRequest


def leg(index, side, price, quantity, **overrides):
    return {"execution_id": f"leg-{index}", "side": side, "time": f"2026-09-{index + 10:02d}T10:00:00-04:00",
            "price": price, "quantity": quantity, "reason": None, **overrides}


def interleaved():
    return [leg(1, "buy", 100, 10), leg(2, "sell", 120, 5), leg(3, "buy", 80, 10), leg(4, "sell", 110, 10)]


def request(rows):
    return {"user_id": "private-user", "trade_id": "batch", "stock": {"symbol": "PRIVATE"},
            "trade": {"executions": rows}, "decision": {"buy_reason": "按计划分批买卖，逐笔理由未记录"}}


class ExecutionTests(unittest.TestCase):
    def test_interleaved_partial_exits_use_cost_at_each_execution(self):
        trade = Trade(executions=interleaved(), profit_loss_amount=999999)
        summary = trade.execution_summary
        self.assertEqual((summary.buy_count, summary.sell_count), (2, 2))
        self.assertEqual((summary.total_bought, summary.total_sold, summary.remaining_quantity), (20, 15, 5))
        self.assertEqual(summary.average_buy_price, 90)
        self.assertAlmostEqual(summary.average_sell_price, 113.33333333)
        self.assertAlmostEqual(summary.realized_profit_loss, 333.33333333)
        self.assertAlmostEqual(summary.remaining_cost_basis, 433.33333333)
        self.assertAlmostEqual(summary.remaining_average_cost, 86.66666667)
        self.assertEqual([row.occurrence for row in summary.timeline], [1, 1, 2, 2])
        self.assertEqual(summary.timeline[1].realized_profit_loss, 100)
        self.assertAlmostEqual(trade.profit_loss_amount, 333.33333333)

    def test_averages_are_quantity_weighted_and_closed_positions_reset(self):
        trade = Trade(executions=[leg(1, "buy", 100, 1), leg(2, "buy", 200, 3), leg(3, "sell", 180, 4), leg(4, "buy", 10, 2)])
        summary = trade.execution_summary
        self.assertEqual(summary.average_buy_price, 120)
        self.assertEqual(summary.remaining_average_cost, 10)
        self.assertEqual(summary.realized_profit_loss, 20)
        self.assertEqual(trade.quantity, 6)

    def test_buys_only_are_an_open_position_not_a_realized_loss(self):
        trade = Trade(executions=[leg(1, "buy", 100, 10), leg(2, "buy", 80, 30)])
        self.assertEqual(trade.buy_price, 85)
        self.assertIsNone(trade.sell_time)
        self.assertIsNone(trade.profit_loss_amount)
        self.assertEqual(trade.execution_summary.remaining_quantity, 40)

    def test_absolute_time_sorting_not_upload_order(self):
        rows = [leg(2, "sell", 110, 1, time="2026-09-11T11:00:00-04:00"), leg(1, "buy", 100, 1, time="2026-09-11T22:00:00+08:00")]
        self.assertEqual(Trade(executions=rows).profit_loss_amount, 10)

    def test_duplicate_and_incomplete_records_fail(self):
        for override in [{"time": "2026-09-11"}, {"time": "2026-09-11T10:00:00"}, {"quantity": 0}, {"quantity": 1.5}, {"quantity": "10"}, {"price": float("inf")}, {"price": 0}]:
            with self.subTest(override=override), self.assertRaises(ValidationError):
                Trade(executions=[{**leg(1, "buy", 100, 10), **override}])
        for rows in [[], [leg(1, "buy", 100, 1)] * 2, [leg(1, "buy", 100, 1), leg(1, "buy", 100, 1, execution_id="other")], interleaved() * 26]:
            with self.subTest(rows=rows), self.assertRaises(ValidationError):
                Trade(executions=rows)

    def test_sales_must_be_covered_at_that_instant_not_by_future_buys(self):
        for rows in [[leg(1, "sell", 100, 1)], [leg(1, "buy", 100, 1), leg(2, "sell", 120, 2), leg(3, "buy", 100, 1)]]:
            with self.assertRaises(ValidationError):
                Trade(executions=rows)

    def test_maximum_supported_amount_and_total_quantity(self):
        trade = Trade(executions=[leg(1, "buy", 1e12, 100000000)])
        self.assertEqual(trade.execution_summary.remaining_cost_basis, 1e20)
        with self.assertRaises(ValidationError):
            Trade(executions=[leg(1, "buy", 1, 100000000), leg(2, "buy", 1, 1)])

    def test_prompt_includes_every_leg_and_no_identity(self):
        req = TradeAnalysisRequest.model_validate(request(interleaved()))
        payload = build_analysis_payload(req, [])
        self.assertEqual(len(payload["trade"]["executions"]), 4)
        self.assertEqual(payload["trade"]["execution_summary"]["buy_count"], 2)
        self.assertNotIn("PRIVATE", str(payload))
        self.assertNotIn("private-user", str(payload))

    def test_api_returns_program_calculated_summary_and_rejects_overselling(self):
        with patch.dict(os.environ, {"USE_MOCK_LLM": "true"}), TestClient(app) as client:
            result = client.post("/analyze-trade", json=request(interleaved()))
            self.assertEqual(result.status_code, 200)
            self.assertAlmostEqual(result.json()["execution_summary"]["realized_profit_loss"], 333.33333333)
            self.assertEqual(client.post("/analyze-trade", json=request([leg(1, "sell", 100, 1)])).status_code, 422)

    def test_claude_cannot_override_calculated_summary(self):
        data = request(interleaved())
        result = mock_behavior_analysis(TradeAnalysisRequest.model_validate(data)).model_dump()
        result["execution_summary"] = {"realized_profit_loss": 999999}
        with patch.dict(os.environ, {"USE_MOCK_LLM": "false", "LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "test-only"}), patch("app.main.retrieve_theory", return_value=[]), patch("app.main.claude_json", return_value=result) as provider, TestClient(app) as client:
            response = client.post("/analyze-trade", json=data)
            self.assertEqual(response.status_code, 200)
            self.assertAlmostEqual(response.json()["execution_summary"]["realized_profit_loss"], 333.33333333)
            self.assertNotIn("execution_summary", provider.call_args.kwargs["schema"]["properties"])
            prose = provider.call_args.kwargs["schema"]["properties"]["behavior_summary"]
            self.assertNotIn("pattern", prose)
            self.assertIn("Complete sentences", prose["description"])

    def test_schema_valid_but_empty_coaching_is_rejected(self):
        data = request(interleaved())
        for key, value in [("coaching_advice", []), ("reflection_questions", [" "]), ("risk_notice", ""), ("uncertainty", {"level": "low", "reason": ""}), ("behavior_summary", "第二次买入的理由为"), ("coaching_advice", ["卖出理由为"])]:
            result = mock_behavior_analysis(TradeAnalysisRequest.model_validate(data)).model_dump()
            result[key] = value
            with patch.dict(os.environ, {"USE_MOCK_LLM": "false", "LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "test-only"}), patch("app.main.retrieve_theory", return_value=[]), patch("app.main.claude_json", return_value=result), TestClient(app) as client:
                self.assertEqual(client.post("/analyze-trade", json=data).status_code, 502)


if __name__ == "__main__":
    unittest.main()
