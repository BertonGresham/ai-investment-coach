from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP, localcontext


def summarize_executions(executions: list[dict]) -> dict:
    """Long-only, moving weighted-average cost; excludes fees, taxes and FX."""
    with localcontext(prec=50):
        return _summarize(executions)


def _summarize(executions: list[dict]) -> dict:
    ordered = sorted(executions, key=lambda row: datetime.fromisoformat(row["time"].replace("Z", "+00:00")))
    bought = sold = held = 0
    buy_count = sell_count = 0
    buy_amount = sell_amount = cost = realized = sold_cost = Decimal(0)
    seen_ids, seen_rows = set(), set()
    timeline = []

    def number(value):
        return float(value.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP))

    for row in ordered:
        instant = datetime.fromisoformat(row["time"].replace("Z", "+00:00"))
        fingerprint = (instant, row["side"], row["price"], row["quantity"])
        if row["execution_id"] in seen_ids or fingerprint in seen_rows:
            raise ValueError("Duplicate or indistinguishable executions; verify the source records.")
        seen_ids.add(row["execution_id"])
        seen_rows.add(fingerprint)
        quantity = row["quantity"]
        amount = Decimal(str(row["price"])) * quantity
        step_profit = None
        if row["side"] == "buy":
            buy_count += 1
            bought += quantity
            held += quantity
            buy_amount += amount
            cost += amount
            occurrence = buy_count
        else:
            if quantity > held:
                raise ValueError("A sale exceeds the position at that time; include earlier purchases. Short selling is not supported.")
            sell_count += 1
            sold += quantity
            sell_amount += amount
            basis = cost * quantity / held
            step_profit = amount - basis
            realized += step_profit
            sold_cost += basis
            cost -= basis
            held -= quantity
            if not held:
                cost = Decimal(0)
            occurrence = sell_count
        timeline.append({**row, "occurrence": occurrence, "remaining_quantity": held,
                         "realized_profit_loss": number(step_profit) if step_profit is not None else None})
    if not bought or bought > 100_000_000:
        raise ValueError("Total purchased quantity must be between 1 and 100000000.")
    return {
        "accounting_method": "moving_weighted_average_excluding_fees_taxes_fx",
        "buy_count": buy_count, "sell_count": sell_count,
        "total_bought": bought, "total_sold": sold, "remaining_quantity": held,
        "average_buy_price": number(buy_amount / bought),
        "average_sell_price": number(sell_amount / sold) if sold else None,
        "remaining_cost_basis": number(cost),
        "remaining_average_cost": number(cost / held) if held else None,
        "realized_profit_loss": number(realized) if sold else None,
        "realized_profit_loss_rate": number(realized / sold_cost) if sold_cost else None,
        "timeline": timeline,
    }
