from decimal import Decimal, localcontext

from app.schemas import ScreenshotDetails, ScreenshotTradeFields


def complete_trade_fields(fields: ScreenshotTradeFields, details: ScreenshotDetails, side: str) -> list[str]:
    """Derive only from a visibly identified gross execution amount, never net cash/balance."""
    if side not in {"buy", "sell"} or details.gross_amount is None:
        return []
    price_key = f"{side}_price"
    price = getattr(fields, price_key)
    with localcontext(prec=50):
        gross = Decimal(str(details.gross_amount))
        if price is None and fields.quantity:
            derived = gross / fields.quantity
            if Decimal("0.00000001") <= derived <= Decimal("1e12"):
                setattr(fields, price_key, float(derived))
                return [price_key]
        if fields.quantity is None and price:
            derived = gross / Decimal(str(price))
            if derived == derived.to_integral_value() and 1 <= derived <= 100_000_000:
                fields.quantity = int(derived)
                return ["quantity"]
    return []
