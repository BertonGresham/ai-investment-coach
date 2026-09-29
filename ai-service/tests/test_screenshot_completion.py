import unittest
from datetime import date

from pydantic import ValidationError

from app.schemas import ScreenshotDetails, ScreenshotTradeFields
from app.screenshot_fields import complete_trade_fields
from app.market_context import MarketContextRequest


class CompletionTests(unittest.TestCase):
    def test_derive_price_only_from_gross_amount_not_fee_or_tax(self):
        fields = ScreenshotTradeFields(quantity=2, buy_time="2026-05-13")
        details = ScreenshotDetails(gross_amount=569000, fee=395, tax=10)
        self.assertEqual(complete_trade_fields(fields, details, "buy"), ["buy_price"])
        self.assertEqual(fields.buy_price, 284500)
        self.assertEqual(fields.buy_time, "2026-05-13")
        self.assertIsNone(fields.buy_reason)
        self.assertIsNone(fields.sell_price)

    def test_integer_quantity_only_and_no_overwriting(self):
        for amount, expected in [(200, 2), (210, None)]:
            fields = ScreenshotTradeFields(sell_price=100)
            complete_trade_fields(fields, ScreenshotDetails(gross_amount=amount), "sell")
            self.assertEqual(fields.quantity, expected)
        fields = ScreenshotTradeFields(buy_price=100, quantity=3)
        self.assertEqual(complete_trade_fields(fields, ScreenshotDetails(gross_amount=200), "buy"), [])
        self.assertEqual(fields.quantity, 3)

    def test_missing_amount_and_ambiguous_round_trip_not_derived(self):
        for side, details in [("buy", ScreenshotDetails(fee=100, tax=20)), ("round_trip", ScreenshotDetails(gross_amount=200))]:
            fields = ScreenshotTradeFields(quantity=2)
            self.assertEqual(complete_trade_fields(fields, details, side), [])
            self.assertIsNone(fields.buy_price)

    def test_market_cutoff_accepts_date_without_fabricated_instant(self):
        req = MarketContextRequest(symbol="AAPL", as_of="2025-07-25")
        self.assertEqual(req.as_of, date(2025, 7, 25))
        with self.assertRaises(ValidationError):
            MarketContextRequest(symbol="AAPL", as_of="2025-07-25T10:00:00")


if __name__ == "__main__":
    unittest.main()
