import unittest

import httpx

from scripts.smoke_test import run_checks


class SmokeTestSafetyTests(unittest.TestCase):
    def test_smoke_test_refuses_live_service_before_analysis(self):
        requests = []

        def handle(request):
            requests.append((request.method, request.url.path))
            return httpx.Response(200, json={"status": "ok", "analysis_mode": "llm"})

        with httpx.Client(base_url="http://test", transport=httpx.MockTransport(handle)) as client:
            with self.assertRaisesRegex(ValueError, "Refusing"):
                run_checks(client)
        self.assertEqual(requests, [("GET", "/health")])


if __name__ == "__main__":
    unittest.main()
