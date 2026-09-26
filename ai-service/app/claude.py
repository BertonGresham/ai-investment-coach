from __future__ import annotations

import json
import os
from typing import Any

from httpx import Client


def _output_schema(schema: dict[str, Any]) -> dict[str, Any]:
    # Claude constrains structure; Pydantic still checks all numeric/string limits.
    unsupported = {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems"}
    result = dict(schema)
    limits = [f"{name}={result.pop(name)}" for name in unsupported if name in result]
    if limits:
        result["description"] = (result.get("description", "") + " Constraints: " + ", ".join(sorted(limits))).strip()
    for name in ("properties", "$defs"):
        if name in result:
            result[name] = {key: _output_schema(value) for key, value in result[name].items()}
    for name in ("anyOf", "allOf", "oneOf"):
        if name in result:
            result[name] = [_output_schema(value) for value in result[name]]
    if "items" in result:
        result["items"] = _output_schema(result["items"])
    if result.get("type") == "object":
        result["additionalProperties"] = False
    return result


def claude_json(
    *,
    api_key: str,
    system: str,
    content: str | list[dict[str, Any]],
    schema: dict[str, Any],
    vision: bool = False,
) -> dict[str, Any]:
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    if vision:
        model = os.getenv("ANTHROPIC_VISION_MODEL") or model
    with Client(timeout=45.0, follow_redirects=False) as client:
        response = client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            json={
                "model": model,
                "max_tokens": 1600 if vision else 2500,
                "system": system,
                "messages": [{"role": "user", "content": content}],
                "output_config": {"format": {"type": "json_schema", "schema": _output_schema(schema)}},
            },
        )
        response.raise_for_status()
        result = response.json()
    if not isinstance(result, dict) or result.get("stop_reason") != "end_turn":
        raise ValueError("Claude did not complete structured output.")
    blocks = result.get("content")
    if not isinstance(blocks, list) or not all(isinstance(block, dict) for block in blocks):
        raise ValueError("Claude returned invalid content.")
    texts = [block.get("text") for block in blocks if block.get("type") == "text"]
    if len(texts) != 1 or not isinstance(texts[0], str) or not texts[0].strip():
        raise ValueError("Claude returned an unexpected text result.")
    data = json.loads(texts[0])
    if not isinstance(data, dict):
        raise ValueError("Claude returned an invalid result object.")
    return data
