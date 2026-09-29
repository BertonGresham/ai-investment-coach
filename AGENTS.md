# Team Development Context

- This is one shared monorepo for AI Investment Coach. Read `docs/team-start.md`, `docs/team-tasks.md`, `docs/api-contract.md`, and `docs/ai-integration-guide.md` before changing integration behavior.
- The first deliverable is a Chinese/Korean web experience. `web-demo/` is the existing AI review page; `frontend-app/` is an earlier Expo prototype. Do not create a separate mobile-first product or replace working modules without agreement.
- Start new feature branches from current `dev`, submit PRs to `dev`, and preserve teammates' uncommitted changes. Do not force-push, reset others' work, or commit directly to shared branches.
- Homepage and trading UI: Jin. Spring Boot, identity, persistence, learning and points: Young. CSV normalization and market data: Jiho. AI service, book retrieval and review UI: Dujun. Coordinate shared schema changes with the module owner.
- Reuse the AI endpoints and structured execution ledger. Preserve every buy/sell execution; missing fields are unknown, not zero. Do not infer motives from prices or profit. Facts, calculated fields, retrieved sources and uncertainty must stay distinguishable.
- Use Mock and synthetic inputs for routine integration. Claude is the current analysis provider; real OCR/model calls require separately configured credentials. Curated book-note matching is not completed vector RAG. Historical daily bars are not real-time quotes.
- Never read, print, commit or request secret `.env` values. Do not commit real brokerage screenshots, account data, database dumps, dependencies or logs. Do not expose the unauthenticated development AI service publicly.
- Backend tests: from `ai-service/`, run `.venv/Scripts/python.exe -m unittest discover -s tests -v` and `.venv/Scripts/python.exe scripts/smoke_test.py --in-process` on Windows. POSIX uses `.venv/bin/python`.
- Frontend tests: from the repository root, run `node --test web-demo/tests/*.test.cjs`.
- Report what actually ran and what remains unverified. A downloaded repository, health endpoint or passing Mock test does not establish a finished team product or successful live OCR.
