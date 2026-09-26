import json
import unittest
from datetime import date, timedelta
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.market_context import (
    DailyBar, MarketContextRequest, MarketDataError, build_market_context,
    demo_bars, fetch_yahoo_bars, select_book_notes,
)
from app.prompts import build_analysis_payload
from app.schemas import TradeAnalysisRequest


def request(**updates):
    return MarketContextRequest.model_validate({
        "symbol": "AAPL", "as_of": "2025-07-25T14:30:00Z", "source": "demo", **updates,
    })


def bar(day, close=100, volume=100):
    return DailyBar(date=day, open=close, high=close + 1, low=close - 1, close=close, volume=volume)


class MarketFactsTests(unittest.TestCase):
    def test_excludes_same_day_and_future_even_if_provider_returns_them(self):
        bars = [bar(date(2025, 7, 24)), bar(date(2025, 7, 25), 900), bar(date(2025, 7, 26), 2)]
        result = build_market_context(request(), bars)
        self.assertEqual(result.bar_count, 1)
        self.assertEqual(result.metrics.last_close, 100)
        self.assertEqual(result.data_end, date(2025, 7, 24))

    def test_cutoff_uses_new_york_not_input_date(self):
        for as_of, cutoff in [("2025-07-25T09:00:00+09:00", date(2025, 7, 24)),
                              ("2025-01-25T09:00:00+09:00", date(2025, 1, 24))]:
            with self.subTest(as_of=as_of):
                result = build_market_context(request(as_of=as_of), [bar(cutoff - timedelta(days=1)), bar(cutoff)])
                self.assertEqual(result.cutoff_date_exclusive, cutoff)
                self.assertEqual(result.bar_count, 1)

    def test_metrics_use_only_required_windows(self):
        bars = demo_bars(date(2025, 7, 25))
        result = build_market_context(request(), bars)
        self.assertEqual(result.metrics.sma20, round(sum(x.close for x in bars[-20:]) / 20, 4))
        self.assertEqual(result.metrics.five_session_change_pct, round((bars[-1].close / bars[-6].close - 1) * 100, 4))
        self.assertEqual(result.metrics.volume_vs_previous20, round(bars[-1].volume / (sum(x.volume for x in bars[-21:-1]) / 20), 4))

    def test_insufficient_bars_and_zero_volume_leave_null_metrics(self):
        result = build_market_context(request(), [bar(date(2025, 7, 24))])
        self.assertIsNone(result.metrics.daily_change_pct)
        self.assertIsNone(result.metrics.five_session_change_pct)
        self.assertIsNone(result.metrics.sma20)
        bars = [x.model_copy(update={"volume": 0}) for x in demo_bars(date(2025, 7, 25))]
        self.assertIsNone(build_market_context(request(), bars).metrics.volume_vs_previous20)

    def test_split_excludes_pre_split_comparisons(self):
        bars = demo_bars(date(2025, 7, 25))
        bars[-1] = bars[-1].model_copy(update={"split": 4.0})
        result = build_market_context(request(), bars)
        self.assertEqual(result.bar_count, 1)
        self.assertIsNone(result.metrics.daily_change_pct)
        self.assertIn("拆股", " ".join(result.warnings))

    def test_duplicate_dates_and_empty_data_fail(self):
        for bars in [[], [bar(date(2025, 7, 24))] * 2]:
            with self.subTest(bars=bars), self.assertRaises(MarketDataError):
                build_market_context(request(), bars)

    def test_old_and_out_of_window_bars(self):
        with self.assertRaises(MarketDataError):
            build_market_context(request(), [bar(date(2024, 1, 1))])
        result = build_market_context(request(), [bar(date(2025, 7, 1))])
        self.assertIn("超过 7 天", " ".join(result.warnings))

    def test_invalid_ohlcv_rejected(self):
        good = bar(date(2025, 7, 24)).model_dump()
        for changes in [{"high": 90}, {"low": 110}, {"close": float("nan")}, {"open": 0}, {"volume": -1}, {"volume": 1.5}]:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                DailyBar.model_validate({**good, **changes})

    def test_demo_is_clearly_labeled_in_both_languages(self):
        for language, word in [("zh-CN", "合成演示"), ("ko-KR", "합성 데모")]:
            result = build_market_context(request(language=language), demo_bars(date(2025, 7, 25)))
            self.assertIn(word, result.kline_summary)
            self.assertEqual(result.explanation_mode, "calculated_facts_and_curated_notes")
            self.assertLess(len(result.kline_summary), 2000)


class MarketRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def post(self, **updates):
        payload = request().model_dump(mode="json")
        return self.client.post("/analyze-market-context", json={**payload, **updates})

    @patch("app.market_context.fetch_yahoo_bars")
    def test_demo_does_not_call_network(self, fetch):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        fetch.assert_not_called()
        self.assertEqual(response.json()["source"], "demo")

    @patch("app.market_context.fetch_yahoo_bars")
    def test_live_route_passes_normalized_symbol_and_cutoff(self, fetch):
        fetch.return_value = [bar(date(2025, 7, 24))]
        response = self.post(symbol="brk.b", source="yahoo")
        self.assertEqual(response.status_code, 200)
        fetch.assert_called_once_with("BRK-B", date(2025, 7, 25))
        self.assertEqual(response.json()["source"], "yahoo")

    @patch("app.market_context.fetch_yahoo_bars")
    def test_invalid_requests_never_call_network(self, fetch):
        for changes in [{"market": "KR"}, {"symbol": "https://example.com"}, {"symbol": "^GSPC"},
                        {"as_of": "2025-07-25T12:00:00"}, {"as_of": "2099-01-01T12:00:00Z"},
                        {"source": "unknown"}, {"language": "en"}, {"unexpected": "field"}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.post(**changes).status_code, 422)
        fetch.assert_not_called()

    @patch("app.market_context.fetch_yahoo_bars", side_effect=MarketDataError("provider_unavailable"))
    def test_provider_failure_is_not_synthetic_success(self, fetch):
        response = self.post(source="yahoo", language="ko-KR")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"]["code"], "provider_unavailable")
        self.assertNotIn("kline_summary", response.json())

    def test_notes_flow_into_existing_trade_prompt(self):
        result = self.post(focus="fear_of_missing_out").json()
        req = TradeAnalysisRequest.model_validate({
            "user_id": "synthetic", "trade_id": "synthetic", "stock": {"symbol": "AAPL"},
            "trade": {"buy_time": "2025-07-25T14:30:00Z", "buy_price": 100, "quantity": 1},
            "decision": {"buy_reason": "test"}, "market_snapshot": {"kline_summary": result["kline_summary"]},
            "rag_context": result["rag_context"],
        })
        payload = build_analysis_payload(req, [])
        self.assertEqual(len(payload["theory_notes"]), 3)
        self.assertIn("gutenberg.org", json.dumps(payload))


class MarketAdapterTests(unittest.TestCase):
    def frame(self):
        return pd.DataFrame({
            "Open": [100, 100], "High": [101, 101], "Low": [99, 99],
            "Close": [100, 100], "Volume": [1000, 1000], "Stock Splits": [0, 0],
        }, index=pd.to_datetime(["2025-07-24", "2025-07-25"]).tz_localize("America/New_York"))

    @patch("yfinance.set_tz_cache_location")
    @patch("yfinance.Ticker")
    def test_real_adapter_excludes_current_day_and_disables_adjustment(self, ticker, cache):
        import yfinance as yf
        self.addCleanup(setattr, yf.config.debug, "hide_exceptions", yf.config.debug.hide_exceptions)
        yf.config.debug.hide_exceptions = True
        ticker.return_value.history.return_value = self.frame()
        ticker.return_value.history_metadata = {"currency": "USD", "exchangeTimezoneName": "America/New_York", "instrumentType": "EQUITY"}
        result = fetch_yahoo_bars("AAPL", date(2025, 7, 25))
        self.assertEqual(len(result), 1)
        args = ticker.return_value.history.call_args.kwargs
        self.assertFalse(args["auto_adjust"])
        self.assertEqual(args["end"], "2025-07-25")
        self.assertFalse(yf.config.debug.hide_exceptions)

    @patch("yfinance.set_tz_cache_location")
    @patch("yfinance.Ticker")
    def test_wrong_market_empty_frame_and_provider_exception(self, ticker, cache):
        ticker.return_value.history.return_value = self.frame()
        ticker.return_value.history_metadata = {"currency": "KRW"}
        with self.assertRaises(MarketDataError) as caught:
            fetch_yahoo_bars("TEST", date(2025, 7, 25))
        self.assertEqual(caught.exception.code, "unsupported_instrument")
        ticker.return_value.history.return_value = pd.DataFrame()
        with self.assertRaises(MarketDataError) as caught:
            fetch_yahoo_bars("TEST", date(2025, 7, 25))
        self.assertEqual(caught.exception.code, "no_data")
        ticker.return_value.history.side_effect = RuntimeError("private upstream details")
        with self.assertRaises(MarketDataError) as caught:
            fetch_yahoo_bars("TEST", date(2025, 7, 25))
        self.assertEqual(str(caught.exception), "provider_unavailable")

    def test_book_notes_are_scoped_and_attributable(self):
        for language in ("zh-CN", "ko-KR"):
            general = select_book_notes(language, "general")
            all_notes = select_book_notes(language, "fear_of_missing_out")
            self.assertEqual(len(general), 2)
            self.assertEqual(len(all_notes), 3)
            self.assertEqual(len({n.id for n in all_notes}), 3)
            for note in all_notes:
                self.assertEqual(note.author, "G. C. Selden")
                self.assertEqual(note.publication_year, 1912)
                self.assertIn("USA", note.rights_scope)
                self.assertEqual(note.content_type, "team_paraphrase_not_quotation")


if __name__ == "__main__":
    unittest.main()
