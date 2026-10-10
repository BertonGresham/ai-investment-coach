# Integration validation (2026-10-10)

## Source branches

- AI and CSV baseline: dev, 8568c2d.
- Young backend: PR #3, 4fde750 (not merged when validation began).
- Jin homepage: feature/frontend-trading-jin, 8def1a1 (no PR at inspection).
- Jin's branch was four commits behind dev. Only homepage assets and the review handoff were integrated; older shared documentation was not copied over dev.

## Integration behavior

- `/` opens Jin's bilingual synthetic paper-trading homepage.
- `/review.html` opens the AI review, account controls and history.
- Paper trades stay in localStorage until explicitly imported into the review form and submitted by an authenticated user. The homepage does not claim server persistence.
- The review adapter uses authenticated execution-list endpoints, not the old flat trade draft. Submission retries reuse an idempotency key.
- Account changes discard stale responses and clear account-specific UI. Persisted Mock and LLM reports remain separately selectable for profile generation.

## Verification status

- AI regression suite: 79 tests passed, mock/offline only.
- Web regression suite: 54 tests passed after the homepage routing integration. Inline review JavaScript and all new scripts pass syntax checks.
- Browser smoke: synthetic buy 10 at 100, sell 5 at 120, homepage-to-review handoff, complete execution import and Mock analysis passed. Remaining quantity 5 and realized P&L 100 are preserved. Korean review at mobile width has no page-level horizontal overflow. This does not validate database persistence.
- Code commit 9a41908 fixes Spring Boot's cleartext HTTP/2 upgrade against Uvicorn by explicitly selecting HTTP/1.1. Earlier stub-server tests missed this transport incompatibility; direct AI requests could succeed while the Java request returned 422.
- Backend H2 and isolated MySQL suites: 11 tests each passed locally after ECJ compilation, including a regression check that AI requests do not send an Upgrade header.
- Standard Windows Maven compilation encountered filesystem AccessDenied errors. Independently, GitHub Actions [38027073088](https://github.com/BertonGresham/ai-investment-coach/actions/runs/38027073088) PASSED the normal Java 17 Maven/H2 lifecycle (11 tests), MySQL 8.4 suite (11 tests), and live cross-service checks for 9a41908.
- That live check uses the real web session adapter in Node, Spring Boot, MySQL and Uvicorn in Mock mode, not a stub AI server. It verifies registration, four execution legs, repeat-submission idempotency, account isolation, logout revocation, re-login and report persistence after a backend restart. It is NOT browser UI acceptance.
- Four-leg fixture: buy 10 at 100, sell 5 at 120, buy 10 at 80, sell 10 at 110. Buy weighted average 90, sell weighted average about 113.3333, remaining quantity 5, realized P&L about 333.3333, excluding fees and taxes.
- AI/web workflow [38027073026](https://github.com/BertonGresham/ai-investment-coach/actions/runs/38027073026) PASSED for 9a41908: AI tests on Python 3.11/3.12 and web tests.
- The user-started isolated local MySQL now accepts schema creation and account/trade writes. The old running local backend still needs restarting to load the compiled transport fix. Local browser login/save/reload/restart are NOT yet verified.
- No live Claude calls or real brokerage records were used. Do not interpret mock tests as OCR accuracy or real-provider availability evidence.

## Remaining acceptance work

1. Completed for 9a41908: normal Maven build, MySQL tests, live Mock cross-service integration and persistence across a backend restart in CI. Recheck on later code changes.
2. Restart the local backend to load the compiled fix, then verify register/login, save, refresh, logout and cross-account history in a browser.
3. Repeat backend-restart persistence from the browser; the automated adapter check does not replace UI acceptance. Use [the demo acceptance checklist](demo-acceptance.md).
4. Verify screenshot extraction with the user's configured provider separately, with explicit consent for any real records.
5. Add authentication and deployment controls before any public demo URL.

## Reproduce the automated live check

Use only an isolated development database: this creates synthetic accounts and records. Start the AI with USE_MOCK_LLM=true and point the backend at that AI service. From the repository root, run `node scripts/verify-live-integration.cjs`; defaults are AI port 8006 and backend port 8085. After restarting only the backend against the same database, run `node scripts/verify-live-integration.cjs --verify-only`.

The script writes synthetic account credentials and record identifiers to a temporary state file outside the repository by default. Keep it private; do not upload it. INTEGRATION_TEST_STATE can select another private path. This check does not validate Claude, OCR accuracy, public deployment, or real-time quotes.
