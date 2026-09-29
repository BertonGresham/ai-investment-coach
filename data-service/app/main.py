from io import BytesIO
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, UploadFile


app = FastAPI(
    title="AI Investment Coach - Data Service",
    description="Normalize broker CSV data and prepare market data snapshots.",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "data-service"}


@app.post("/parse-csv")
async def parse_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    frame = pd.read_csv(BytesIO(content))

    records: list[dict[str, Any]] = []
    warnings: list[str] = []

    for index, row in frame.iterrows():
        record = {
            "trade_id": f"csv_{index + 1}",
            "symbol": read_first(row, ["symbol", "ticker", "stock_code", "证券代码", "股票代码"]),
            "side": normalize_side(read_first(row, ["side", "type", "买卖方向", "操作"])),
            "trade_time": read_first(row, ["trade_time", "datetime", "date", "成交时间", "交易时间"]),
            "price": to_float(read_first(row, ["price", "成交价格", "价格"])),
            "quantity": to_int(read_first(row, ["quantity", "qty", "成交数量", "数量"])),
        }
        record["amount"] = round((record["price"] or 0) * (record["quantity"] or 0), 4)

        missing = [key for key in ["symbol", "side", "trade_time", "price", "quantity"] if not record[key]]
        if missing:
            warnings.append(f"row {index + 1} missing fields: {', '.join(missing)}")

        records.append(record)

    return {"records": records, "warnings": warnings}


def read_first(row: pd.Series, names: list[str]) -> Any:
    for name in names:
        if name in row and pd.notna(row[name]):
            return row[name]
    return None


def normalize_side(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip().upper()
    if text in {"BUY", "B", "买入", "买"}:
        return "BUY"
    if text in {"SELL", "S", "卖出", "卖"}:
        return "SELL"
    return text


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


