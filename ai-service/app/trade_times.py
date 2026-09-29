import re
from datetime import datetime


def time_precision(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?", value
    ):
        raise ValueError("Use an ISO date or recorded timestamp.")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return "date" if len(value) == 10 else "instant" if parsed.tzinfo else "local"


def order_executions(rows: list[dict], confirmed: bool = False) -> tuple[list[dict], str]:
    precisions = [time_precision(row["time"]) for row in rows]
    if all(p == "instant" for p in precisions):
        return sorted(rows, key=lambda row: datetime.fromisoformat(row["time"].replace("Z", "+00:00"))), "timestamp"
    groups = {}
    for row in rows:
        groups.setdefault(row["time"][:10], []).append(row)
    ambiguous_days = {day for day, group in groups.items() if len(group) > 1 and any(time_precision(row["time"]) == "date" for row in group)}
    mixed_clocks = "instant" in precisions and len(rows) > 1
    if (ambiguous_days or mixed_clocks) and not confirmed:
        raise ValueError("Recorded times do not establish the full order. Confirm the execution sequence; do not invent times.")
    # For incomplete clocks, use recorded calendar dates and an explicitly confirmed same-day order.
    ordered = []
    for day in sorted(groups):
        group = groups[day]
        ordered.extend(group if day in ambiguous_days or mixed_clocks else sorted(group, key=lambda row: row["time"]))
    basis = "recorded_date_and_confirmed_sequence" if ambiguous_days or mixed_clocks else "recorded_date_or_local_time"
    return ordered, basis
