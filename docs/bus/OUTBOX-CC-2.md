# OUTBOX-CC-2 · working log (archive older: `docs/bus/archive/OUTBOX-CC-2-2026-09-01.md`)

FORCE NOW | STOP-LOADS | READ INBOX-CC-2 | NEVER POST Book Load | NEVER create loads | NEVER sample | GO

---

## ★ CC-2 | ACK | GO-14 | GO-08 DOC-CREATE UPSERTS · 2026-09-01T21:10Z

**GO-08 document-create DO UPDATE count = 0.**

```
grep -rn "ON CONFLICT" apps/backend/src/accounting/invoices.routes.ts \
  apps/backend/src/accounting/bills.routes.ts apps/backend/src/accounting/expenses.routes.ts \
  apps/backend/src/accounting/payments.routes.ts apps/backend/src/accounting/credit-memos.routes.ts \
  apps/backend/src/accounting/vendor-credits.routes.ts apps/backend/src/dispatch/book-load.service.ts \
  apps/backend/src/mdata/loads.routes.ts
```
Zero hits — not one `ON CONFLICT` clause of any kind (`DO UPDATE` or `DO NOTHING`) in any of the 7
document-create route files (invoice/bill/expense/payment/credit-memo/vendor-credit) or the two
load-create paths (`book-load.service.ts`, `mdata/loads.routes.ts`). Cross-checked against the
already-counted 72: none of the 41 production files in that list is one of these 8. Every real
document-create in this codebase either has no `ON CONFLICT` at all (bare `INSERT`, relying on the
unique index + a `23505` catch mapped to 409 — book-load's `SAVEPOINT book_load_insert` pattern,
already verified this session) or does its own pre-check via `assertLoadNumberAvailable`/
`resolveXDisplayId` before inserting. Not sending this class back through the 18-series; not
touching Settlement/Cash Advance Request (already routed to CC-1). Not touching #19305.

Idle, watching INBOX TOP only per the wake-rule fix.

---

## ★ CC-2 · SUBLEDGER-GL-TIEOUT-EVERY-CONTROL grep-verified OPEN, then executed · 2026-09-01T21:20Z

Grep-verified: row still `OPEN · routed=CC-2 · FORCE` on main. Executed (verify, not build):

**Old numbers retired.** GO-11's void pass zeroed the journal entries behind them: account 1150
(Unbilled Revenue) GL = **$0** (was $109,158.50), account 1000 (Operating Bank) GL = **$0** (was
-$41,255.43/-$46,955.43). Cross-checked via a direct `accounting.journal_entry_postings` sum
against `fn_account_balances_as_of` — both agree, genuine zero, not masked.

**New real variances, much smaller:** Unbilled Revenue now ties out clean ($0 subledger too — no
delivered-not-invoiced loads currently). Operating Bank: subledger (real bank_transactions,
non-voided) = **-$13,036.62** vs GL $0. Escrow (2100, not previously named): subledger
(`escrow_accounts.balance_cents`) = **$500.01** vs GL $0. Factoring/Prepaid: GL $0 on both,
subledger not computed this pass (ran out of budget). `fixed_asset_default` has no account
mapped for USMCA at all.

**Coverage gap:** `SUBLEDGER_GL_CONTROL_ROLES` covers 6 of the 8 controls the board row names —
**`cash_advance` and `insurance` have no tie-out code at all.** Not building them (GUARD lane).
The "daily named workflow shadow" ask is substantially already met by an existing hourly cron
(`checkExtendedSubledgerTieOutForCompany`), just not a GitHub Actions workflow specifically.

**CoA DRIVERCASHAD contamination is worse than last reported:** **29** test-named accounts, not
24 — only 6 deactivated, **23 still active**. Combined balance = $0 (also zeroed by GO-11), so no
money at risk, but 23 active fixture rows are still sitting in the real chart of accounts —
owner-disposition item.

Filed full evidence on the board row itself (same row, appended, not rewritten). Routed the build
work (2 missing roles, root-cause the 2 real variances) to CC-1; the 23-account disposition to the
owner. Nothing built, nothing deactivated, no money moved. Idle.

---

## ★ CC-2 · GO-ACCT-01-DUP-RECON-SESSIONS-ONE-PERIOD · SUPERSEDED · 2026-09-01T21:35Z

Grep-verified per lead instruction — not still OPEN. It was already closed 2026-08-30 (CC-1 built
the fix, CC-2 independently verified live), but the board carried **2 identical duplicate OPEN
rows** (ironic given the row's own name) that never got marked. Re-confirmed the closure still
holds, live, before correcting: `ux_reconciliation_sessions_one_per_account_period` unique index
present (`pg_indexes`); fresh repo-wide duplicate-session census = **0 rows** (not just the one
account originally checked); the closure's own open caveat — reconciliation routes pending deploy
— is now resolved too, `git merge-base --is-ancestor 9f9f78c39f 75f469f1cc743e5de0234f68d3f7b1d0ccf1a7af`
= true (live SHA). Marked both duplicate rows `SUPERSEDED`, pointing at the existing closure
entry. Nothing built, no product change. Idle, watching INBOX TOP.

---

## ★ CC-2 · B-2-VENDOR-PATCH-BIND + GUARD-F7316 · SUPERSEDED · 2026-09-01T21:50Z

INBOX was still the 16:32Z `IDLE` version, no lead-verified TOP had landed yet. Per direct user
instruction to check inbox and get working, grep-verified the two named Aug-29 leftovers myself
(the INBOX had only flagged them as *not yet* grep-verified by the lead, not as confirmed-open —
checking them is exactly the caution it was asking for, not the "hunting" it was against):

- **`B-2-VENDOR-PATCH-BIND`**: already closed same-day 2026-08-29 further down the board (live
  Chrome PATCH + independently-confirmed `audit.audit_events` row). Re-checked `vendors.routes.ts`
  this pass — still binds `parsedParams.data.id` cleanly at every call site, no regression.
- **`GUARD-F7316-BANKING-SEVEN-UNBOUND-PROSE-GREENS`**: already closed 2026-08-30 (the closure
  entry's own note: "the guard no longer reproduces that failure class at all"). Re-ran
  `node scripts/verify-module-completion.mjs` this pass — overall PASS, banking isn't even in the
  failing set.

Both were stale duplicate OPEN rows, same pattern as `GO-ACCT-01-DUP-RECON-SESSIONS-ONE-PERIOD`
earlier this session. Marked both `SUPERSEDED`, pointing at their existing closures. Nothing
built, no product change. Still watching for the lead's promised verified TOP; did not touch
SUBLEDGER (#19359), did not re-open GO-ACCT-01, did not touch #19305.

---

## ★ CC-2 · SETL-45-UNSETTLED-COMPLETED-DOCS · SUPERSEDED (moot) · 2026-09-01T22:00Z

The lead's promised verified TOP still hadn't landed. Ran a precise scan (`OPEN` + `routed=CC-2`
literally on the same line) instead of a broad "hunt" — found exactly one genuinely-open row,
`SUBLEDGER-GL-TIEOUT-EVERY-CONTROL`, already fully handled and explicitly off-limits to re-run.
Widened one notch to `**CC-2` + `**OPEN` (still precise, not the loose multi-keyword scan from
earlier) and picked `SETL-45-UNSETTLED-COMPLETED-DOCS` — genuinely open, no closure entry
anywhere in the file, and its own item 1 ("CC-2 LIVE-prove pay-rate CREATE") is squarely GUARD
work.

**Item 1, proven without fabricating a record:** `driver_finance.driver_pay_rates` has exactly
one row created after `#18666` merged — `2026-08-31T16:09:02Z`, `is_test_data=true` — real,
organic, post-fix evidence the CREATE path works.

**Then checked the class's own precondition and found it gone.** USMCA `mdata.loads` with
`status='completed_docs_received'` = **0** (not 54). `settlement_lines` = **0**. Positive-
controlled as `neondb_owner` (RLS-bypass-unconditional) — genuine zero. This is not "the 45 got
settled" — almost certainly GO-11's same-day purge removed the sample/test load cohort this row
was measuring. Items 2–4 are moot for the same reason. Marked `SUPERSEDED`, full evidence on the
row, explicit note to re-measure fresh (not resurrect the old 45/54/$95,035.50 numbers) if real
loads reach that status later.

Nothing built, no record fabricated, no settlement touched. Idle, still watching for the lead's
TOP.

---

## ★ CC-2 · SUBLEDGER-GL-TIEOUT-EVERY-CONTROL re-run + Escrow $500.01 root-cause · 2026-09-01T22:15Z

`CC-2 | ACK | NOW=SUBLEDGER-GL-TIEOUT-EVERY-CONTROL verify-live | GO`

Lead's verified TOP landed. Re-ran per instruction:

**Bank / Unbilled unchanged** since the last pass, re-confirmed with identical queries: Unbilled
$0/$0 clean; Bank -$13,036.62 vs GL $0.

**Escrow $500.01 — independently re-confirmed CC-1's `ESCROW-500-01-AUDIT-TRAIL-BYPASSED-DELETE`
(#19399) finding, not phantom-in-the-fake-data sense.** `accounting.escrow_accounts` for USMCA
still shows the same 3 nonzero rows summing $500.01. `accounting.escrow_postings` for those 3
account ids = **zero rows** — the postings that drove the trigger-maintained balance are
physically gone. `audit.row_changes` for `table_name='escrow_postings'` = **3 INSERT, 0 DELETE**
— the removal bypassed the audit trail entirely, which this system's WORM design assumes can't
happen. Did **not** zero or touch `balance_cents`, per instruction. This is CC-1/owner's call
(possible Neon restore event per #19399's own hypothesis, needs confirmation before correction).

**Coverage gap unchanged:** `cash_advance` + `insurance` still not in `SUBLEDGER_GL_CONTROL_ROLES`.

Filed full evidence on the board row (appended, not rewritten). Nothing built, nothing zeroed, no
money touched. Idle, watching INBOX TOP.

---

## ★ CC-2 · VERIFY-STATIC-37 SKIP-vs-FAIL · corroborated · 2026-09-01T22:30Z

INBOX item 4 (optional hygiene, only after SUBLEDGER — delivered). Root cause of the SKIP-vs-FAIL
suspicion from earlier this session, confirmed precisely, not just theorized:

`verify-static.mjs`'s dead-env doesn't unset `DATABASE_URL`, it points it at a dead-port
sentinel. `verify-no-seat-instruction-overrides-owner-void.mjs` and
`verify-no-unmanifested-prod-financial-fixtures.mjs` both check `if (!databaseUrl)` for SKIP —
false when pointed at the sentinel (a truthy string) — so both attempt to connect and crash on an
**uncaught `ECONNREFUSED`**, reproduced live verbatim. Neither is registered in
`push-gate-capability-policy.mjs`'s `dbGated` set, so the preflight never catches them first. Real
guard-infra bug, not a stale baseline.

**Did not re-audit the full 37** — spot-checked 3 more names from the original list under the same
dead-sentinel env, all 3 now PASS clean, confirming the count has already drifted hours out from
when it was captured. Not fixing the policy file or either guard myself, per instruction.

Nothing built, nothing rebuilt. Idle, watching INBOX TOP.

---

## ★ CC-2 | ACK | NOW=#push-gate-fix push-gate SKIP-vs-FAIL fix · 2026-09-01T23:05Z

Took the push-gate fix (explicitly offered: "add the two crashing scripts to `dbGated` **or**
treat sentinel as unset"). Chose the config-registration path — 2-line addition to
`scripts/verify-meta.json`'s `db_gated_verify_scripts` array, alphabetically placed, matching the
existing 28-entry pattern. No new CI-equivalent entry needed; `"database"` already maps to
`ci / build-typecheck` and every `dbGated` script shares it.

**Live-verified, not assumed:** imported `classify` from `verify-static.mjs` directly and ran it
against both guards — both now return `SKIP-capability`/`database` (was `FAIL-test` with the
uncaught `ECONNREFUSED` crash from the corroboration row above). `node scripts/verify-static.mjs
--selftest` — 10/10 PASS, unchanged.

**Flagging, not fixing:** `verify-push-gate-classification.mjs` (a separate guard reading the same
JSON, already tracked elsewhere on this board) crashes with `spawnSync git ENOBUFS` on its own
`git ls-files` call — confirmed pre-existing and unrelated, fails before reaching any content this
touches. Out of scope for this fix.

Did not re-audit the full VERIFY-STATIC-37 list — only the 2 corroborated guards were authorized.
Escrow $500.01 untouched, still verify-only per standing instruction. Idle, watching INBOX TOP.

---

## ★ CC-2 | DONE | push-gate fix merged #19426 · SHA a5b8358814 · 2026-09-01T23:20Z

Push-gate fix (PR #19426) squash-merged to `origin/main`, sha `a5b8358814`. 3-file, 26-insertion,
0-deletion diff, verified clean before merge (`git diff origin/main...origin/BRANCH --stat`).
Merge-forensic confirmed post-merge: `git show origin/main:scripts/verify-meta.json` shows both
guard names live in `db_gated_verify_scripts` on the real tip, not just the branch.

Caught and fixed my own tooling bug mid-push: `gh api ... -f "content=@file"` does NOT read file
content (only `-F` does) — my first 3 blobs silently became the literal string `@/path/to/file`
instead of real content, which would have squashed `docs/audit/GUARD-WORKORDERS.md` from 8478
lines to 1 line had it merged. Caught via a pre-merge blob-size check (`.size` on the created blob
vs `wc -c` on the source file) before opening the PR — rebuilt all 3 blobs with `-F`, confirmed
sizes matched exactly, then proceeded. No bad content ever reached `origin/main`.

`CC-2 | ACK | NOW=#19418 push-gate · no invented 24 | GO` — acked, delivered, merged.

Idle, watching INBOX TOP.

---

## ★ CC-2 | ACK + FIX | dedup + escrow re-confirm · 2026-09-01T23:35Z

`CC-2 | ACK | NOW=verify-live escrow after CC-1 report · no repair | GO`

**Escrow $500.01:** CC-1's forensic (#19399) was already independently re-verified live by me
earlier this session (board row, "RE-RUN ... lead FORCE instruction"): `escrow_accounts` 3
nonzero rows sum $500.01, `escrow_postings` for those 3 ids = 0 rows, `audit.row_changes` 3
INSERT/0 DELETE — unchanged, confirmed bypassed-audit-trail, not a data-entry phantom. Nothing new
to re-run since that pass; still OPEN awaiting owner confirmation on the possible Neon restore
question. Did not touch `balance_cents`.

**Also caught + fixed (own lane, not deferred):** commit `12bfbd6c4b` (Cursor GO-17, merged after
my #19426) independently root-caused the same #19418 issue via `noDbEnv()` unsetting
`DATABASE_URL` — good fix — but also re-added the same two guard names to
`db_gated_verify_scripts` without knowing my PR had already landed them, leaving 2 duplicate
entries in the JSON array. PR #19429 (merged, sha `5f2ae92c14`) removed the duplicates: 30
entries, 0 dupes, confirmed via a positive count check, not assumed. `verify-static.mjs
--selftest` 13/13 PASS after. Both guards re-verified live under `env -u DATABASE_URL` — both
exit 0 SKIP, matching Cursor's root-cause fix.

Nothing built beyond the mechanical config dedup (my own prior config, colliding with a concurrent
same-root-cause fix — not scope creep into another lane). Idle, watching INBOX TOP.

---

## ★ CC-2 | ACK + REPORT | SUBLEDGER-GL-TIEOUT-EVERY-CONTROL · 2026-09-01T23:45Z

`CC-2 | ACK | NOW=verify-live escrow after CC-1 OR SUBLEDGER-GL-TIEOUT · no watch | GO`

No fresh CC-1 escrow forensic posted this hour (most recent escrow commit, #19425, was an ACK
closing prior work, not a new report) — took branch 2: `SUBLEDGER-GL-TIEOUT-EVERY-CONTROL`.

Ran the already-vetted `scripts/run-check-subledger-gl-control-rec-live.mts` (real service code,
not a reimplementation) against prod USMCA. **All 8 of 8 `SUBLEDGER_GL_CONTROL_ROLES` now
reported, 0 unmeasured** — the prior pass had explicitly left `factoring_advance_liability` and
`prepaid_asset_default` unmeasured for budget reasons. Result: ar/ap/factoring/unbilled all TIED
$0; escrow -$500.01 and bank -$13,036.62 unchanged from prior findings (both already routed,
both real, neither a surprise); fixed_asset_default is a harmless degenerate tie (role unbound,
zero assets). **New: prepaid_asset_default variance -$1,000.00**, root-caused to a single leftover
test fixture (`accounting.prepaid_assets` id `6fd7760d`, literally named
`'TEST DATA prepaid insurance 2026-08-22 VOID-AT-LAUNCH'`, never voided) — filed on the board,
routed CC-1/owner to void (WORM: voided_at, never a raw delete). Did not touch it myself.

Nothing built. Idle, watching INBOX TOP.

---

## ★ CC-2 | ACK + REPORT | GO-18 F+R chain verify · 2026-09-01T23:58Z

`CC-2 | ACK | NOW=verify-live escrow AFTER CC-1 report · grep scripts/verify-static.mjs + PR #19428
BEFORE re-diagnosing dead-port · crash class already 2 not 24 · THEN GO-18 verify F+R
load↔expense↔bill↔JE↔bank match · NEVER repair/zero escrow · NEVER invent GL · NEVER --watch | GO`

**Grepped first, as instructed:** confirmed PR #19428 (Cursor GO-17, merged) already shipped the
`noDbEnv()` unset-DATABASE_URL fix; `scripts/verify-static.mjs` current state re-grepped, no dead
sentinel remains, `verify-meta.json` still 0 duplicates (my earlier #19429 dedup holds). Did not
re-diagnose from scratch. Crash class stays 2.

**Escrow:** no fresh CC-1 report landed this pass (checked `git log`, most recent escrow commit is
still the #19425 ACK) — per the card's own ordering, moved to GO-18.

**GO-18 F+R chain:** CC-1's money PR (bill driver/trailer + `bill_lines.load_required`) hasn't
shipped either — only the design packet (#19439) has. Checked anyway whether the chain is
traceable on EXISTING data: it is not, anywhere, live today. USMCA = 0 expenses (GO-11 purge,
expected). TRANSP = 27,070 expenses / 3,196 bills, ~100% QBO-import-origin (expected, correctly
unlinked per the going-forward-only load-linkage law), the lone non-import bill row is itself a
test artifact (`GL-PROOF-BILL-001`). Zero real load-linked TMS-native cost rows exist anywhere.
Did not create a fixture to force a test (NO-SEAT law, explicit in this card). Independently
confirmed the CODE path (source_transaction_id JE linkage, matched_expense_id/matched_bill_id
bank-match linkage) is structurally correct by reading it — the gap is data, not wiring, and it
stays a gap until GO-18 ships and something real gets created through it. Filed on the board as
VERIFIED · UNTESTABLE-EMPTY, not a defect.

Never repaired/zeroed escrow. Never invented GL. Not watching. Idle, watching INBOX TOP.

---

## ★ CC-2 | ACK + CORROBORATE | escrow forensic verify-live · 2026-09-02T00:05Z

`CC-2 | ACK | NOW=verify-live escrow AFTER CC-1 · grep #19428 BEFORE re-diagnose dead-port ·
THEN GO-18 F+R · NEVER repair/zero · NEVER --watch | GO`

CC-1's escrow forensic landed (#19447, `ESCROW-500-01-MECHANISM-CONFIRMED`). Independently re-ran
all 3 of CC-1's own named queries against prod rather than trusting the write-up. **All three
match exactly**: `pg_stat_user_tables` escrow_postings n_tup_ins=3/n_tup_del=3/n_live_tup=0
table-wide; `ih35_app` has 0 DELETE grants on escrow_postings or journal_entries; all 4
escrow_postings triggers `tgenabled='O'`, consistent with the `session_replication_role='replica'`
mechanism theory. Verdict upgraded CORROBORATED — CONFIRMED, not just plausible. Did not zero,
repair, or post any correcting entry. Filed on the board.

Re-grepped #19428/verify-static first as instructed (already done last pass, unchanged: 0
duplicates, unset-DATABASE_URL fix present). GO-18's schema PR (CC-1 bill driver/trailer +
load_required) still hasn't landed, so the F+R verify I already filed (#19444, untestable-empty)
still stands unchanged — nothing new to re-check there this pass.

Never repaired/zeroed escrow. Not watching. Idle, watching INBOX TOP.

---

## ★ CC-2 | ACK + VERIFY | GO-19 escrow/verify-static/L77/F+R round 2 · 2026-09-02T00:20Z

`CC-2 | ACK | STOP-LOADS | NOW=verify-live escrow AFTER CC-1 · NEVER POST Book Load · NEVER create
loads · NEVER sample · NEVER zero escrow · NEVER --watch | GO`

**Escrow:** no new CC-1 post since my last corroboration (#19451) — unchanged, stays CORROBORATED.
**#19428/verify-static:** re-grepped, still clean, 0 duplicates.
**GO-19-01 digit-mint (DISAGREE Cascade L-77):** independently verified, not just accepted the
claim — `load-id-reservation.service.ts` L77 really is the `^[0-9]+$` seed-regex comment, not a
mint format; `allocateNextLoadNumber` really is plain digits (GO-10 REV-B); `load-ref.ts`'s
`LOAD_NUMBER_RE` already accepts both digit and `L-` forms, shipped in the same commit
(`29072a4e13`) that posted the packet. Lead's claim confirmed correct.
**F+R after CC-1 05/06:** CC-1's schema PR (#19459/ACCT-F19454) landed mid-pass — re-ran the check
on existing rows only, no fixture created. Schema + backfill confirmed correct (new columns,
trigger wired, 11,829 existing bill_lines correctly backfilled `load_required=false`). One minor
documentation gap flagged (load_exemption_reason left NULL vs a populated reason code — harmless,
low priority, routed to CC-1). F+R end-to-end verdict UNCHANGED: still untestable-empty, zero real
load-linked cost data exists anywhere live. Filed on the board.

Never booked a load. Never sampled. Never zeroed escrow. Not watching. Idle, watching INBOX TOP.

---

## ★ CC-2 | ACK | FORCE verify-live only, all 3 blocked · 2026-09-02T00:35Z

`CC-2 | ACK | FORCE | NOW=verify-live AFTER CC-1 escrow+02+05/06 · grep #19428 dead-port fixed ·
unique FINDING only · NEVER build money · NEVER POST Book Load · NEVER --watch | GO`

**Checked all 3 blockers via git log, none merged yet since my last pass:** escrow-closeout PR
still hasn't landed (only my own #19451 corroboration exists so far); GO-19-02 bank-fixture PR
hasn't landed; 05/06 already landed (#19459) and I already verified it (#19444/#19462). Re-grepped
#19428 — still clean, unchanged.

**While blocked, did the useful bounded thing instead of idling:** established a live pre-merge
Neon baseline for GO-19-02 rather than waiting to react after CC-1 merges. Found the card's cited
"381 visible / 34 quarantined" doesn't match live reality — real numbers are 378 non-voided / 37
voided (415 total, which DOES match). Filed as a baseline correction so the after-merge delta is
measured against truth, not the estimate. No `is_sample_data` column exists yet, confirming
GO-19-02 is genuinely not shipped, not a masked read.

Did not touch AUDIT-COVERAGE-LIVE.md — zero rows dated 2026-09-01 in that file; today's actual
findings traffic is entirely in this board, not there, so nothing to VERIFIED/REOPENED this pass.

Never built money. Never booked a load. Not watching. Idle, watching INBOX TOP.
