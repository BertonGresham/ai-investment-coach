"""Check the integration contract using synthetic data and Mock mode only."""

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

import httpx

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from app.schemas import InvestmentProfileResponse, ScreenshotRecognitionResponse, TradeAnalysisResponse
from app.market_context import MarketContextResponse


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def run_checks(client) -> None:
    health = client.get("/health")
    health.raise_for_status()
    check(health.json().get("analysis_mode") == "mock", "Refusing to test a non-Mock service. No analysis requests were sent.")
    print("PASS health: Mock mode")

    for language in ("zh-CN", "ko-KR"):
        payload = json.loads((SERVICE_ROOT / "examples" / f"trade.{language}.json").read_text(encoding="utf-8"))
        market = client.post("/analyze-market-context", json={
            "symbol": "AAPL", "as_of": "2025-07-25T14:30:00Z", "source": "demo",
            "language": language, "focus": "fear_of_missing_out",
        })
        market.raise_for_status()
        context = MarketContextResponse.model_validate(market.json())
        check(context.source == "demo" and context.data_end < context.cutoff_date_exclusive, "Invalid market cutoff or source.")
        check(len(context.book_notes) == 3, "Missing sourced book notes.")
        payload["market_snapshot"] = {"kline_summary": context.kline_summary}
        payload["rag_context"] = [note.model_dump() for note in context.rag_context]
        response = client.post("/analyze-trade", json=payload)
        response.raise_for_status()
        analysis = TradeAnalysisResponse.model_validate(response.json())
        check(analysis.trade_id == payload["trade_id"], "Trade ID was not preserved.")
        response = client.post("/analyze-profile", json={
            "user_id": payload["user_id"], "language": language,
            "trade_analyses": [analysis.model_dump(mode="json")],
        })
        response.raise_for_status()
        profile = InvestmentProfileResponse.model_validate(response.json())
        check(all(window.sample_count == 1 for window in (profile.short_term, profile.medium_term, profile.long_term)), "Unexpected profile sample count.")
        print(f"PASS {language}: synthetic market + book notes -> trade -> profile (7/30/90 days)")

    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2cAAAAASUVORK5CYII=")
    response = client.post("/recognize-trade-screenshot", files={"file": ("synthetic.png", png, "image/png")}, data={"language": "ko-KR"})
    response.raise_for_status()
    recognition = ScreenshotRecognitionResponse.model_validate(response.json())
    check(recognition.status == "mock" and all(value is None for value in recognition.fields.model_dump().values()), "Mock must not claim to have recognized the image.")
    print("PASS screenshot upload: explicitly no real OCR")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--in-process", action="store_true", help="Run without a server or network socket; force Mock in this process only.")
    args = parser.parse_args()
    try:
        if args.in_process:
            from fastapi.testclient import TestClient
            from app.main import app

            with patch.dict(os.environ, {"USE_MOCK_LLM": "true"}), TestClient(app) as client:
                run_checks(client)
        else:
            with httpx.Client(base_url=args.base_url, timeout=15) as client:
                run_checks(client)
    except (httpx.HTTPError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print("All integration checks passed. No real model was tested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
