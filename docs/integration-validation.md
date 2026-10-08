# Integration validation (2026-10-09)

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
- Backend H2 suite: 10 tests passed after compilation with ECJ against Maven-resolved dependencies.
- Standard Windows Maven compilation was blocked by filesystem AccessDenied errors. The ECJ workaround does not establish that the normal Maven lifecycle passed.
- MySQL 8.4 connected but schema initialization failed with an operating-system access-rights error in the isolated test data directory. MySQL persistence and browser login/save/reload are NOT yet verified.
- `.github/workflows/backend-tests.yml` adds standard Java 17 Maven verification and a MySQL 8.4 test run. Remote results must be checked before merging.
- No live Claude calls or real brokerage records were used. Do not interpret mock tests as OCR accuracy or real-provider availability evidence.

## Remaining acceptance work

1. Pass the normal Maven build and MySQL test suite in CI or an authorized development environment.
2. Start the backend and verify register/login, save, refresh, logout and cross-account history in a browser.
3. Restart the backend and verify persisted trades/reports remain available.
4. Verify screenshot extraction with the user's configured provider separately, with explicit consent for any real records.
5. Add authentication and deployment controls before any public demo URL.
