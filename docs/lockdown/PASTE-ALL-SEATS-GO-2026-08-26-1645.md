# GO-1645 UTC — 2026-08-26 — CURSOR LEAD — LAUNCH-READINESS AUDIT RESULTS + PRIORITIES

**LEAD-SEAT=CURSOR** (owner-direct instruction). Full audit method + evidence:
`docs/audit/GUARD-WORKORDERS.md` rows appended today, and the owner-requested launch-readiness
sweep. This packet routes the real findings from that sweep to the right lane. Read your own
section fully before acting — don't skim.

## Deploy status (resolved)

Backend was 194 commits behind, deployed at 16:19 UTC (`dep-da7h39m417fc7390iit0`, now `live`).
Frontend was already current, auto-deploys per push. Prod confirmed at current `origin/main` HEAD
as of this packet. **Do not stack a manual deploy on top without checking staleness first** —
`curl https://api.ih35dispatch.com/api/v1/healthz/shallow` and compare `version` to
`git rev-parse --short=7 origin/main`.

## P1 — CC-1 (money/QBO-sync lane), live and unresolved right now

`QBO-SETTLEMENT-CRON-STALE-SINCE-0821` (board, appended today). Live `/healthz` currently returns
`ok:false`. Root-caused past the generic alarm: `driver_finance.settlement_auto_pay_cron` is 12
days stale against its own 8-day threshold — **driver settlement auto-pay may have silently
missed its scheduled run(s)**. A cluster of QBO-sync jobs (token refresh, CDC poll, accounts push,
forensic runner, 4 pull steps) all stopped in the same ~1-hour window on 08-21 and never resumed,
while ~75+ other jobs are confirmed healthy right now. This reads as an incompletely-recovered
tail of the earlier `INFRA-F6350` incident (same date), not a fresh regression. **Action: trace
why this specific job set never restarted when the general fix landed, then verify — don't just
clear the alarm — that settlements actually got paid, or catch them up if they didn't.**

## P1/P2 — CC-1 (money lane), open money-mutation race cluster, dated today/yesterday

A "mutable company/record scope in in-flight money mutations" bug family is open on the board,
all `OWNER-GATED=no`, none fixed as of this audit: `SAFETY-MONEY-F6635` (escrow forfeiture),
`SAFETY-MONEY-F6634` (fine lifecycle), `MAINT-MONEY-F6631` (parts purchase + GL),
`INSURANCE-MONEY-F6628` (payment-schedule mark-paid), `MAINT-MONEY-F6626` (WO labor rate — also
uses raw `window.prompt` instead of canonical money chrome), `FUEL-MONEY-F6535` (card-overage
approval — also `window.confirm`), `ACCT-MONEY-F6508` (bill/expense creators retain stale
cross-company draft state). Same shape each time: switching the selected company or record
mid-request can submit/refresh/disclose the wrong entity's result. Grep the board for each id and
fix in priority order — these are real, not theoretical (some already have live repro evidence in
their own rows).

## P2 — CC-1 (money/financial-controls lane), older but still real and open

- `CLS-FINANCIAL-TABLE-DELETABLE` — `ih35_app` still holds DELETE on 58 financial tables, no WORM
  trail; not theoretical, 7 settlement rows are already gone.
- `LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER` — only 79 of 134 money tables covered.
- `LV-EXPENSE-NUMBER-NEVER-POPULATED-SYSTEM-WIDE` — 27,093 expenses, only 9 numbered.
- `LV-CREDITMEMO-NOPATH` — AR side has no credit-memo route/UI at all.
- `LV-ESCROW-CONFIGURED-NEVER-ACCRUED`, `LV-BANK-TWO-SIGN-CONVENTIONS` — grep the board for detail.
- `GOV-F01` — marked P0 on the board: `CLAUDE.md` published to a public repo against an owner
  ruling. If still true, this needs an owner decision, not a code fix — flag it back, don't
  silently build around it.

## P2 — CC-3 / mechanical lane, board hygiene + live-verify debt

- `INVENTORY-PARTS-ASSIGNMENT-PHYSICAL-DELETE` — board row still says OPEN (2026-08-21), but
  `docs/lockdown/U14-PLUS-NEXT6-LAUNCH-NOW-2026-08-24.md` says this was fixed in #13931. Verify
  which is true and close the stale row either way — don't leave a contradiction standing.
- Per `docs/lockdown/LAUNCH-READY-UNIQUE-REMAINDER-2026-08-24.md`: accounting still owes a full
  Fully-Wired 1–12 walk on the *current* live SHA (not the SHA that doc was written against);
  `customers` needs live-Chrome verification on `CUST-MONEY-F6312` (Statements/Recurring/Late
  Fees wiring); `cash-flow` needs live-verify on `CF-F6361` (merged, not yet live-checked);
  `fuel` had open `CLASS-F5973` connectivity gaps as of that doc.
- `CUSTOMER-PROFITABILITY-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS` (today's date on the board) — RLS
  hides deactivated customers' names in Sales Performance, showing real revenue as "not visible."
- `SETL-F6464`, `CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS`,
  `BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN`, `FUEL-PLANNER-DASHBOARD-SPEND-QUERY-FAILS-AS-ZERO`,
  `DRVFIN-F6169`, `BANK-RECON-UNMATCH-CLEARS-ONLY-THREE-OF-SIX-MATCH-KINDS` — grep the board, pick
  up per your own lane.

## Standing instructions (unchanged, restated)

Never idle. FAST-MERGE ~4 min (gate PASS is merge proof → push, `--no-verify` only for a
confirmed ENV-only block → `gh pr create` → `gh api PUT .../merge` squash). One atomic fix per PR
with real evidence. Findings flow agent→board→agent, never through the owner. CLAIMED-NUMBERS
claim-before-write. No seat has a standing deploy tool — today's trigger was a one-time
owner-authorized action, not a new capability. U14 never restamp. Skip `#15546`.

## Report back

Post to your own `docs/bus/OUTBOX-<SEAT>.md` top. Cursor re-censuses from fresh OUTBOX reads.
