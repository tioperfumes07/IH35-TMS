# Lead ruling — CC-3 lane cross, ROUND 30.4 11-test-failures assignment

**Date:** 2026-09-22
**Seat:** CC-3
**File crossed:** `apps/backend/src/governance/__tests__/void-cancel-requests.test.ts` (test file only,
no production code in `governance/` touched)

`docs/bus/LANES.md` does not list `apps/backend/src/governance/**` under any seat. This ruling
documents the Lead's own direct, same-session, by-name assignment of this exact file to CC-3,
verbatim from `~/Downloads/09-22-2026-Claude-Coder-3-ELEVEN-BACKEND-FAILURES-AND-SETTLEMENT-NUMBERING-LAW.md`:

> "## 2 · YOUR 11 FAILURES — all survive a fully migrated DB, all real
> | file | fails | error |
> |---|---|---|
> | ...
> | `src/governance/__tests__/void-cancel-requests.test.ts` | 1 | `unexpected SQL in mock: UPDATE driver_finance.settlement_lines` |
> ...
> Rule for every one of them: do not delete the assertion, do not loosen the matcher, do not add a
> blanket catch-all arm to the fake client. Teach the double the *specific* query the service now
> issues, and if the service is issuing a query it should not, fix the service."

The fix here is exactly that: the test's mock client was missing an arm for a real, already-shipped
production query (`UPDATE driver_finance.settlement_lines`, the SETL-LINES-VOID-GAP cascade fix in
`void-cancel-executors.ts`) — a test-only change, teaching the mock the query it already needed to
handle. No production file under `governance/` is touched. This file satisfies
`verify-lane-ownership.mjs`'s `LANE_CROSS` requirement.
