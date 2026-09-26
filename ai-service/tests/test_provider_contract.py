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


class ScreenshotClassificationMixin:
    def classified_response(self, data):
        return self.provider(data if os.environ["LLM_PROVIDER"] == "anthropic" else json.dumps(data))

    def test_cash_flow_zero_placeholders_never_become_a_trade(self):
        for language in ("zh-CN", "ko-KR"):
            with self.subTest(language=language):
                self.classified_response({
                    "record": {"kind": "cash_flow", "label": "예탁금이용료입금", "side": "unknown"},
                    "fields": {"buy_time": "2026-07-10", "buy_price": 0, "sell_price": 109, "quantity": 0},
                    "field_confidence": {"buy_price": 0.9, "quantity": 0.9},
                })
                response = self.upload(language)
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["status"], "not_trade")
                self.assertEqual(data["record"]["label"], "예탁금이용료입금")
                self.assertTrue(all(value is None for value in data["fields"].values()))
                self.assertEqual(data["field_confidence"], {})
                self.assertIn("资金流水" if language == "zh-CN" else "자금 내역", data["notice"])

    def test_missing_or_ambiguous_classification_is_not_importable(self):
        for record in ({}, {"kind": "unknown"}, {"kind": "security_trade", "side": "unknown"}):
            with self.subTest(record=record):
                self.classified_response({"record": record, "fields": {"symbol": "AAPL", "buy_price": 109}})
                response = self.upload()
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "needs_review")
                self.assertTrue(all(value is None for value in response.json()["fields"].values()))

    def test_single_execution_never_fills_the_opposite_side(self):
        for side in ("buy", "sell"):
            with self.subTest(side=side):
                self.classified_response({
                    "record": {"kind": "security_trade", "side": side},
                    "fields": {"symbol": "AAPL", "quantity": 1, "buy_price": 100, "sell_price": 105, "buy_time": "2026-07-10", "sell_time": "2026-07-11", "buy_reason": "Entry rule", "sell_reason": "Exit rule"},
                    "field_confidence": {"buy_price": 0.9, "sell_price": 0.9},
                })
                response = self.upload()
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["status"], "recognized")
                opposite = "sell" if side == "buy" else "buy"
                for suffix in ("price", "time", "reason"):
                    self.assertIsNone(data["fields"][f"{opposite}_{suffix}"])
                    self.assertIsNotNone(data["fields"][f"{side}_{suffix}"])
                self.assertEqual(set(data["field_confidence"]), {f"{side}_price"})


class ProviderContractTests(ScreenshotClassificationMixin, unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"USE_MOCK_LLM": "false", "LLM_PROVIDER": "openai", "OPENAI_API_KEY": "local-test-not-a-real-key"})
        environment.start()
        self.addCleanup(environment.stop)
        rag = patch("app.main.retrieve_theory", return_value=[])
        self.rag = rag.start()
        self.addCleanup(rag.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def provider(self, content=None, status=200, timeout=False, finish_reason="stop"):
        self.requests = []
        if content:
            try:
                decoded = json.loads(content)
                if isinstance(decoded, dict) and "fields" in decoded:
                    decoded.setdefault("record", {"kind": "security_trade", "side": "round_trip"})
                    content = json.dumps(decoded)
            except json.JSONDecodeError:
                pass

        def handle(request):
            self.requests.append(json.loads(request.content))
            if timeout:
                raise httpx.ReadTimeout("synthetic timeout", request=request)
            if status != 200:
                return httpx.Response(status, json={"error": {"message": "private-provider-detail", "type": "api_error"}})
            return httpx.Response(200, json={
                "id": "offline-response", "object": "chat.completion", "created": 0,
                "model": "offline-model", "choices": [{"index": 0, "finish_reason": finish_reason, "message": {"role": "assistant", "content": content}}],
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

    def test_blank_fields_are_not_successful_recognition(self):
        self.provider(json.dumps({"fields": {"symbol": "  ", "buy_reason": ""}, "field_confidence": {"symbol": 0.99}}))
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "needs_review")
        self.assertEqual(response.json()["field_confidence"], {})

    def test_incomplete_provider_output_is_rejected_even_when_json_is_valid(self):
        for reason in ("length", "content_filter"):
            for endpoint in ("trade", "vision"):
                with self.subTest(reason=reason, endpoint=endpoint):
                    result = {"fields": {"symbol": "AAPL"}} if endpoint == "vision" else mock_behavior_analysis(TradeAnalysisRequest.model_validate(example())).model_dump()
                    self.provider(json.dumps(result), finish_reason=reason)
                    with self.assertLogs("app.main", level="ERROR"):
                        response = self.upload() if endpoint == "vision" else self.client.post("/analyze-trade", json=example())
                    self.assertEqual(response.status_code, 502)

    def test_validation_logs_do_not_contain_extracted_private_data(self):
        self.provider(json.dumps({"fields": {"buy_price": "private-account-123456"}}))
        with self.assertLogs("app.main", level="ERROR") as logs:
            response = self.upload()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private-account-123456", "\n".join(logs.output))
        self.assertNotIn("private-account-123456", response.text)

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
                    with self.assertLogs("app.main", level="ERROR") as logs:
                        response = self.upload() if endpoint == "vision" else self.client.post("/analyze-trade", json=example())
                    self.assertEqual(response.status_code, 502)
                    self.assertNotIn("private-provider-detail", response.text)
                    self.assertNotIn("local-test-not-a-real-key", response.text)
                    self.assertNotIn("private-provider-detail", "\n".join(logs.output))
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


class ClaudeProviderContractTests(ScreenshotClassificationMixin, unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {
            "USE_MOCK_LLM": "false", "LLM_PROVIDER": "anthropic",
            "ANTHROPIC_API_KEY": "sk-ant-offline-test", "OPENAI_API_KEY": "",
            "ANTHROPIC_MODEL": "claude-sonnet-4-6", "ANTHROPIC_VISION_MODEL": "",
        })
        environment.start()
        self.addCleanup(environment.stop)
        rag = patch("app.main.retrieve_theory", return_value=[])
        self.rag = rag.start()
        self.addCleanup(rag.stop)
        openai = patch("app.main.OpenAI", side_effect=AssertionError("Unexpected OpenAI call"))
        self.openai = openai.start()
        self.addCleanup(openai.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def provider(self, data=None, *, reason="end_turn", status=200, timeout=False, blocks=None):
        self.requests = []
        if isinstance(data, dict) and "fields" in data:
            data = {"record": {"kind": "security_trade", "side": "round_trip"}, **data}

        def handle(request):
            self.requests.append(request)
            if timeout:
                raise httpx.ReadTimeout("private-provider-detail", request=request)
            if status != 200:
                return httpx.Response(status, json={"error": {"message": "private-provider-detail"}})
            content = blocks if blocks is not None else [{"type": "text", "text": json.dumps(data)}]
            return httpx.Response(200, json={"stop_reason": reason, "content": content})

        client = httpx.Client(transport=httpx.MockTransport(handle))
        factory = patch("app.claude.Client", return_value=client)
        factory.start()
        self.addCleanup(factory.stop)
        self.addCleanup(client.close)
        return client

    def upload(self, language="zh-CN"):
        return self.client.post("/recognize-trade-screenshot", files={"file": ("synthetic.png", PNG, "image/png")}, data={"language": language})

    def test_claude_analysis_uses_correct_credentials_and_validates_evidence(self):
        for language in ("zh-CN", "ko-KR"):
            with self.subTest(language=language):
                payload = example(language)
                result = mock_behavior_analysis(TradeAnalysisRequest.model_validate(payload)).model_dump()
                result["trade_id"] = "invented-id"
                result["detected_behavior_problems"][0]["theory_reference"] = "invented-book"
                client = self.provider(result)
                response = self.client.post("/analyze-trade", json=payload)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["trade_id"], payload["trade_id"])
                self.assertIsNone(response.json()["detected_behavior_problems"][0]["theory_reference"])
                request = self.requests[0]
                self.assertEqual(str(request.url), "https://api.anthropic.com/v1/messages")
                self.assertEqual(request.headers["x-api-key"], "sk-ant-offline-test")
                self.assertEqual(request.headers["anthropic-version"], "2023-06-01")
                self.assertNotIn("authorization", request.headers)
                body = json.loads(request.content)
                self.assertEqual(body["model"], "claude-sonnet-4-6")
                self.assertEqual(body["output_config"]["format"]["type"], "json_schema")
                schema = body["output_config"]["format"]["schema"]
                self.assertEqual(schema["properties"]["coaching_advice"]["type"], "array")
                self.assertNotIn("minimum", schema["$defs"]["PersonalityTag"]["properties"]["confidence"])
                prompt = body["messages"][0]["content"]
                self.assertIn(language, prompt)
                self.assertNotIn(payload["user_id"], prompt)
                self.assertNotIn(payload["stock"]["symbol"], prompt)
                self.assertTrue(client.is_closed)
        self.openai.assert_not_called()

    def test_claude_vision_uses_base64_and_leaves_missing_fields_empty(self):
        for language in ("zh-CN", "ko-KR"):
            with self.subTest(language=language):
                client = self.provider({"fields": {"symbol": "AAPL", "buy_time": "unclear date"}, "field_confidence": {"symbol": 0.9, "buy_time": 0.95}, "warnings": []})
                response = self.upload(language)
                self.assertEqual(response.status_code, 200)
                self.assertIsNone(response.json()["fields"]["buy_time"])
                self.assertIsNone(response.json()["fields"]["buy_reason"])
                self.assertEqual(response.json()["field_confidence"], {"symbol": 0.9})
                body = json.loads(self.requests[0].content)
                self.assertIn("Korean" if language == "ko-KR" else "Simplified Chinese", body["system"])
                source = body["messages"][0]["content"][0]["source"]
                self.assertEqual(source["media_type"], "image/png")
                self.assertEqual(base64.b64decode(source["data"]), PNG)
                confidence_schema = body["output_config"]["format"]["schema"]["properties"]["field_confidence"]
                self.assertIn("buy_time", confidence_schema["properties"])
                self.assertFalse(confidence_schema["additionalProperties"])
                self.assertTrue(client.is_closed)
        self.openai.assert_not_called()

    def test_claude_rejects_truncation_refusal_and_wrong_output(self):
        cases = [
            {"reason": "max_tokens", "data": {"fields": {"symbol": "AAPL"}}},
            {"reason": "refusal"}, {"reason": "tool_use"},
            {"data": []}, {"blocks": []},
            {"blocks": [{"type": "tool_use", "name": "unexpected", "input": {}}]},
            {"blocks": [{"type": "text", "text": "{}"}] * 2},
            {"blocks": [{"type": "text", "text": "not JSON"}]},
            {"data": {"fields": {"buy_price": "private-account-123456"}}},
        ]
        for case in cases:
            for endpoint in ("trade", "vision"):
                with self.subTest(case=case, endpoint=endpoint):
                    client = self.provider(**case)
                    with self.assertLogs("app.main", level="ERROR") as logs:
                        response = self.upload() if endpoint == "vision" else self.client.post("/analyze-trade", json=example())
                    self.assertEqual(response.status_code, 502)
                    self.assertNotIn("private-account-123456", response.text + "\n".join(logs.output))
                    self.assertTrue(client.is_closed)

    def test_claude_rejects_stringified_lists_and_out_of_range_scores(self):
        result = mock_behavior_analysis(TradeAnalysisRequest.model_validate(example())).model_dump()
        result["coaching_advice"] = json.dumps(result["coaching_advice"])
        self.provider(result)
        with self.assertLogs("app.main", level="ERROR"):
            self.assertEqual(self.client.post("/analyze-trade", json=example()).status_code, 502)
        self.provider({"fields": {"symbol": "AAPL"}, "field_confidence": {"symbol": 1.5}})
        with self.assertLogs("app.main", level="ERROR"):
            self.assertEqual(self.upload().status_code, 502)

    def test_claude_provider_errors_are_sanitized(self):
        for status, timeout in ((401, False), (429, False), (500, False), (200, True)):
            for endpoint in ("trade", "vision"):
                with self.subTest(status=status, timeout=timeout, endpoint=endpoint):
                    client = self.provider(status=status, timeout=timeout)
                    with self.assertLogs("app.main", level="ERROR") as logs:
                        response = self.upload() if endpoint == "vision" else self.client.post("/analyze-trade", json=example())
                    self.assertEqual(response.status_code, 502)
                    self.assertNotIn("private-provider-detail", response.text + "\n".join(logs.output))
                    self.assertNotIn("sk-ant-offline-test", response.text)
                    self.assertTrue(client.is_closed)

    def test_invalid_provider_or_missing_key_never_sends_request(self):
        for config in ({"ANTHROPIC_API_KEY": ""}, {"LLM_PROVIDER": "invalid"}, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-ant-offline-test"}):
            with self.subTest(config=config), patch.dict(os.environ, config), patch("app.main.claude_json") as provider:
                self.assertEqual(self.client.post("/analyze-trade", json=example()).status_code, 503)
                self.assertEqual(self.upload().status_code, 503)
                provider.assert_not_called()
                self.rag.assert_not_called()
        self.openai.assert_not_called()

    def test_claude_mock_never_sends_request_even_with_key(self):
        with patch.dict(os.environ, {"USE_MOCK_LLM": "true"}), patch("app.main.claude_json") as provider:
            self.assertEqual(self.client.get("/health").json()["llm_provider"], "anthropic")
            self.assertEqual(self.client.post("/analyze-trade", json=example()).status_code, 200)
            self.assertEqual(self.upload().json()["status"], "mock")
            provider.assert_not_called()


class ScreenshotConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_vision_call_runs_off_event_loop_thread(self):
        event_loop_thread = threading.get_ident()
        provider_threads = []

        def recognize(*args):
            provider_threads.append(threading.get_ident())
            return {"status": "needs_review", "fields": {}, "notice": "Synthetic test."}

        with patch.dict(os.environ, {"USE_MOCK_LLM": "false", "LLM_PROVIDER": "openai", "OPENAI_API_KEY": "local-test-not-a-real-key"}), patch("app.main.llm_screenshot_recognition", side_effect=recognize):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post("/recognize-trade-screenshot", files={"file": ("synthetic.png", PNG, "image/png")})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(provider_threads), 1)
        self.assertNotEqual(provider_threads[0], event_loop_thread)


if __name__ == "__main__":
    unittest.main()
