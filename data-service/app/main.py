"""CSV normalization API for the AI Investment Coach data service."""

from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

app = FastAPI(
    title="AI Investment Coach - Data Service",
    description="Normalize broker CSV data into the shared trade-record format.",
    version="0.2.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "data-service"}


@app.post("/parse-csv")
async def parse_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    """Parse a broker CSV and return records in docs/api-contract.md format."""
    if file.filename and not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a .csv file.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="CSV file exceeds the 10 MB limit.")
    if not content.strip():
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    frame = read_csv(content)
    if frame.empty and len(frame.columns) == 0:
        raise HTTPException(status_code=400, detail="CSV must contain a header row.")

    # Broker exports often include a BOM or whitespace in the column names.
    frame.columns = [str(column).replace("\ufeff", "").strip() for column in frame.columns]
    columns = {normalize_header(column): column for column in frame.columns}
    aliases = {
        "symbol": (
            "symbol", "ticker", "stock_code", "证券代码", "股票代码", "代码",
            "종목코드", "종목번호", "단축코드",
        ),
        "side": (
            "side", "type", "trade_type", "买卖方向", "操作", "方向", "구분",
            "거래구분", "매매구분", "체결구분",
        ),
        "trade_time": (
            "trade_time", "datetime", "date", "trade_date", "成交时间", "交易时间",
            "成交日期", "체결일시", "체결일자", "거래일시", "거래일자", "매매일자",
        ),
        "price": ("price", "trade_price", "成交价格", "成交价", "价格", "체결가"),
        "quantity": (
            "quantity", "qty", "volume", "成交数量", "成交股数", "数量", "체결수량",
        ),
        "amount": (
            "amount", "trade_amount", "成交金额", "发生金额", "金额", "거래금액",
            "정산금액",
        ),
    }

    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    for row_number, (_, row) in enumerate(frame.iterrows(), start=1):
        # Do not turn a trailing blank line into a misleading invalid record.
        if all(is_missing(value) for value in row.tolist()):
            continue

        raw = {key: get_value(row, columns, names) for key, names in aliases.items()}
        price = to_number(raw["price"])
        quantity = to_integer(raw["quantity"])
        amount = to_number(raw["amount"])
        if amount is None and price is not None and quantity is not None:
            amount = round(price * quantity, 4)

        record = {
            "trade_id": f"csv_{row_number}",
            "symbol": clean_text(raw["symbol"]),
            "side": normalize_side(raw["side"]),
            "trade_time": normalize_time(raw["trade_time"]),
            "price": price,
            "quantity": quantity,
            "amount": amount,
        }

        missing = [
            field
            for field in ("symbol", "side", "trade_time", "price", "quantity")
            if record[field] is None
        ]
        if missing:
            warnings.append(f"row {row_number}: missing or invalid {', '.join(missing)}")
        records.append(record)

    return {"records": records, "warnings": warnings}


def read_csv(content: bytes) -> pd.DataFrame:
    """Read common UTF-8, Korean, and Simplified Chinese CSV encodings."""
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp949", "gb18030"):
        try:
            # Keeping values as strings preserves stock codes such as 005930.
            return pd.read_csv(
                BytesIO(content), encoding=encoding, sep=None, engine="python", dtype=str
            )
        except (UnicodeDecodeError, pd.errors.ParserError, UnicodeError) as exc:
            last_error = exc
    raise HTTPException(status_code=400, detail=f"Could not read CSV: {last_error}") from last_error


def normalize_header(value: str) -> str:
    return "".join(value.strip().lower().split())


def get_value(
    row: pd.Series, normalized_columns: dict[str, str], names: tuple[str, ...]
) -> Any:
    for alias in names:
        column = normalized_columns.get(normalize_header(alias))
        if column is not None and not is_missing(row[column]):
            return row[column]
    return None


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def clean_text(value: Any) -> str | None:
    if is_missing(value):
        return None
    text = str(value).strip()
    return text or None


def normalize_side(value: Any) -> str | None:
    text = clean_text(value)
    if text is None:
        return None
    upper = text.upper()
    if upper in {"BUY", "B", "1", "买", "买入", "证券买入", "融资买入", "매수"}:
        return "BUY"
    if upper in {"SELL", "S", "2", "卖", "卖出", "证券卖出", "融券卖出", "매도"}:
        return "SELL"
    return None


def to_number(value: Any) -> float | None:
    if is_missing(value):
        return None
    text = str(value).strip().replace(",", "").replace("￥", "").replace("¥", "").replace("$", "")
    if not text or text in {"-", "--"}:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def to_integer(value: Any) -> int | None:
    number = to_number(value)
    if number is None or not number.is_integer():
        return None
    return int(number)


def normalize_time(value: Any) -> str | None:
    if is_missing(value):
        return None
    if isinstance(value, (date, datetime, pd.Timestamp)):
        parsed = pd.Timestamp(value)
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            parsed = pd.Timestamp(text)
        except (TypeError, ValueError, OverflowError):
            return None
    if pd.isna(parsed):
        return None
    return parsed.isoformat()
