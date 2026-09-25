import base64
import json
import os
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from openai import OpenAI

from app.main import app, mock_behavior_analysis
from app.schemas import TradeAnalysisRequest


EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2cAAAAASUVORK5CYII=")


def example(language="zh-CN"):
    return json.loads((EXAMPLES / f"trade.{language}.json").read_text(encoding="utf-8"))


class ProviderContractTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"USE_MOCK_LLM": "false", "OPENAI_API_KEY": "local-test-not-a-real-key"})
        environment.start()
        self.addCleanup(environment.stop)
        rag = patch("app.main.retrieve_theory", return_value=[])
        self.rag = rag.start()
        self.addCleanup(rag.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def provider(self, content=None, status=200, timeout=False):
        self.requests = []

        def handle(request):
            self.requests.append(json.loads(request.content))
            if timeout:
                raise httpx.ReadTimeout("synthetic timeout", request=request)
            if status != 200:
                return httpx.Response(status, json={"error": {"message": "private-provider-detail", "type": "api_error"}})
            return httpx.Response(200, json={
                "id": "offline-response", "object": "chat.completion", "created": 0,
                "model": "offline-model", "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
            })

        sdk = OpenAI(api_key="local-test-not-a-real-key", max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(handle)))
        factory = patch("app.main.OpenAI", return_value=sdk)
        factory.start()
        self.addCleanup(factory.stop)
        self.addCleanup(sdk.close)
        return sdk

    def upload(self, language="zh-CN", image=PNG, mime="image/png"):
        return self.client.post("/recognize-trade-screenshot", files={"file": ("synthetic.png", image, mime)}, data={"language": language})

    def test_llm_response_keeps_request_identity_and_filters_invented_sources(self):
        payload = example("ko-KR")
        result = mock_behavior_analysis(TradeAnalysisRequest.model_validate(payload)).model_dump()
        result.update(trade_id="invented-id", trade_time="1900-01-01", analysis_type="invented-type")
        result["detected_behavior_problems"][0]["theory_reference"] = "invented-book"
        sdk = self.provider(json.dumps(result))
        response = self.client.post("/analyze-trade", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["trade_id"], payload["trade_id"])
        self.assertEqual(response.json()["trade_time"], payload["trade"]["buy_time"])
        self.assertIsNone(response.json()["detected_behavior_problems"][0]["theory_reference"])
        prompt = self.requests[0]["messages"][1]["content"]
        self.assertIn("ko-KR", prompt)
        self.assertNotIn(payload["stock"]["symbol"], prompt)
        self.assertNotIn(payload["user_id"], prompt)
        self.assertTrue(sdk.is_closed())

    def test_vision_payload_contains_image_and_does_not_invent_reasons(self):
        sdk = self.provider(json.dumps({"fields": {"symbol": "005930", "buy_price": 70000, "quantity": 2}, "field_confidence": {"symbol": 0.9, "buy_reason": 0.8, "unknown_field": 0.8}, "warnings": []}))
        response = self.upload("ko-KR")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "recognized")
        self.assertIsNone(body["fields"]["buy_reason"])
        self.assertIsNone(body["fields"]["sell_time"])
        self.assertEqual(body["field_confidence"], {"symbol": 0.9})
        messages = self.requests[0]["messages"]
        self.assertIn("Korean", messages[0]["content"])
        image_url = messages[1]["content"][1]["image_url"]["url"]
        self.assertEqual(base64.b64decode(image_url.split(",", 1)[1]), PNG)
        self.assertTrue(sdk.is_closed())

    def test_vision_discards_unreadable_dates_and_their_confidence(self):
        self.provider(json.dumps({"fields": {"symbol": "AAPL", "buy_time": "July sometime"}, "field_confidence": {"buy_time": 0.95}, "warnings": []}))
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["fields"]["buy_time"])
        self.assertEqual(response.json()["field_confidence"], {})
        self.assertTrue(response.json()["warnings"])

    def test_vision_no_fields_returns_needs_review(self):
        self.provider(json.dumps({"fields": {}, "warnings": ["Multiple ambiguous rows."]}))
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "needs_review")
        self.assertTrue(all(value is None for value in response.json()["fields"].values()))

    def test_invalid_model_output_is_502_not_success_or_mock(self):
        for content in (None, "not JSON", "[]", "{}"):
            for endpoint in ("trade", "vision"):
                with self.subTest(content=content, endpoint=endpoint):
                    # An empty vision fields object is a valid needs_review result.
                    if content == "{}" and endpoint == "vision":
                        continue
                    sdk = self.provider(content)
                    with self.assertLogs("app.main", level="ERROR"):
                        response = self.upload() if endpoint == "vision" else self.client.post("/analyze-trade", json=example())
                    self.assertEqual(response.status_code, 502)
                    self.assertNotIn("status", response.json())
                    self.assertTrue(sdk.is_closed())

    def test_invalid_vision_numbers_are_rejected(self):
        for result in ({"fields": {"buy_price": -1}}, {"fields": {"symbol": "AAPL"}, "field_confidence": {"symbol": 1.5}}):
            with self.subTest(result=result):
                self.provider(json.dumps(result))
                with self.assertLogs("app.main", level="ERROR"):
                    response = self.upload()
                self.assertEqual(response.status_code, 502)

    def test_provider_errors_are_sanitized_and_clients_closed(self):
        for status, timeout in ((401, False), (429, False), (500, False), (200, True)):
            for endpoint in ("trade", "vision"):
                with self.subTest(status=status, timeout=timeout, endpoint=endpoint):
                    sdk = self.provider(status=status, timeout=timeout)
                    with self.assertLogs("app.main", level="ERROR"):
                        response = self.upload() if endpoint == "vision" else self.client.post("/analyze-trade", json=example())
                    self.assertEqual(response.status_code, 502)
                    self.assertNotIn("private-provider-detail", response.text)
                    self.assertNotIn("local-test-not-a-real-key", response.text)
                    self.assertTrue(sdk.is_closed())

    def test_missing_key_never_calls_provider(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}), patch("app.main.OpenAI") as factory:
            self.assertEqual(self.client.post("/analyze-trade", json=example()).status_code, 503)
            self.assertEqual(self.upload().status_code, 503)
            factory.assert_not_called()
            self.rag.assert_not_called()

    def test_invalid_input_never_calls_provider(self):
        with patch("app.main.OpenAI") as factory:
            payload = example()
            payload["analysis_context"]["language"] = "unsupported"
            self.assertEqual(self.client.post("/analyze-trade", json=payload).status_code, 422)
            self.assertEqual(self.upload(language="unsupported").status_code, 422)
            self.assertEqual(self.upload(image=b"not-an-image").status_code, 415)
            self.assertEqual(self.upload(mime="text/plain").status_code, 415)
            self.assertEqual(self.upload(image=PNG + b"0" * (8 * 1024 * 1024)).status_code, 413)
            factory.assert_not_called()

    def test_cors_only_allows_configured_origins(self):
        for origin, expected in (("http://127.0.0.1:5173", 200), ("https://untrusted.example", 400)):
            response = self.client.options("/analyze-trade", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"})
            self.assertEqual(response.status_code, expected)
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin if expected == 200 else None)


class ScreenshotConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_vision_call_runs_off_event_loop_thread(self):
        event_loop_thread = threading.get_ident()
        provider_threads = []

        def recognize(*args):
            provider_threads.append(threading.get_ident())
            return {"status": "needs_review", "fields": {}, "notice": "Synthetic test."}

        with patch.dict(os.environ, {"USE_MOCK_LLM": "false", "OPENAI_API_KEY": "local-test-not-a-real-key"}), patch("app.main.llm_screenshot_recognition", side_effect=recognize):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post("/recognize-trade-screenshot", files={"file": ("synthetic.png", PNG, "image/png")})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(provider_threads), 1)
        self.assertNotEqual(provider_threads[0], event_loop_thread)


if __name__ == "__main__":
    unittest.main()
