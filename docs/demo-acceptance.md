# Browser demo acceptance

Status: checklist, not a claim of completion. Automated Mock integration and backend-restart persistence passed for 9a41908; see [validation evidence](integration-validation.md).

## Preconditions

- Use the integration branch and an isolated development database. Keep the AI in Mock mode; do not use real brokerage records for this check.
- Start the web server, business backend and AI service. Configure both services' CORS origins to match the actual web origin.
- This workstation's URL is `http://127.0.0.1:5175/?api=http://127.0.0.1:8006&backend=http://127.0.0.1:8085`. These are local services, not a published website.
- Ensure the backend was restarted after compilation of the HTTP/1.1 fix. An already-running Java process does not automatically load changed class files.

## Checklist

1. Open the homepage. Check Chinese/Korean switching and clearly labeled synthetic quotes. Create a buy and a partial sell; open AI review and explicitly import all executions.
2. Choose account-history mode, register a disposable test account A with a unique email and a password of 12-128 characters. Confirm the account is shown before submitting.
3. Inspect the imported executions, including price, quantity, ordering and remaining shares. Submit analysis. Expect a saved report labeled Mock, not a claim of a live model call.
4. Refresh the page. Open the saved report from history; check the same trade identifier, full execution timeline and totals. There must not be another record merely because the page refreshed.
5. Sign out. History and account-specific report content must clear. Register account B: it must not see account A's records. Sign back in as A and check the original report.
6. Restart only the business backend against the same database. Reload, sign in if necessary and open the same report. No database reset or fixture replacement is allowed as proof of persistence.
7. Repeat the visible workflow in Korean and at a narrow mobile width. Check that buttons remain usable, error messages are understandable and labels do not overlap.
8. Record pass/fail with date, code commit, browser and non-sensitive screenshots. Never include passwords, tokens or model keys. Keep PR #4 draft until outstanding failures are resolved and reviewed.

## Teacher demo boundary

The intended presentation is homepage -> paper trade -> AI review -> execution averages/timeline -> account history -> refresh. Explain that current quotes are synthetic and Mock reports test the workflow. Claude analysis and screenshot recognition require a separate provider-enabled acceptance run; Mock cannot establish OCR accuracy. Public hosting, learning/points and the shop are not established by this checklist.
