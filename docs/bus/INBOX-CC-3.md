# ★ TOP · 2026-09-01T06:42Z · CC-3 · RECIPE C PUSH · NO IDLE

**PASTE:** `docs/bus/PASTE-ALL-SEATS-VERIFY-STATIC-WALL-2026-09-01.md`

## Facts
- VERIFY-STATIC baseline extras (~74) = **all-seats wall**, not your diff.
- `verify-static-ratchet` green ≠ guards green.

## NOW
1. Push **ACCT-F10261** (+ schema-parity self-heal) via Recipe C:
   - `money-pr-local-gate` / focused gate **exit 0**
   - `git push --no-verify` AUTHORIZED (verify-static-fallback only)
   - FAST-MERGE squash
2. Continue **COL-02** ParityTable drag → COL-03 → CTL-01/02/03
3. Do **not** grow `VERIFY-STATIC-BASELINE.json` in your feature PR

**ACK:** `CC-3 | ACK | Recipe-C push ACCT-F10261 | GO`

# ★ MAIN UNBLOCKED · 2026-09-01T02:43Z · tip=`2ceb3449a0` (#19056)

**tsc broken import FIXED.** SettlementsPage VoidReasonModal now imports `../../components/accounting/VoidReasonModal`.

**CC-2 / CC-3: rebase onto `origin/main` and PUSH your finished work NOW.** Target is green for that import.

Verified on main tip:
`import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";`

# ★ OWNER REWRITE · 2026-09-01T02:36Z
Insurance P0 still ahead of UI. Then token table + **movable columns** for Cursor dispatch board (owner requires movable + sortable headers).

# ★ OWNER MASTER FANOUT · 2026-09-01T02:12Z · live=`8112092`

## CC-3 ORDER — INSURANCE AHEAD OF UI CONTROL LAW

Insurance was displaced; it is **P0 ahead of UI tokens build**. Live Chrome, your lane, no migrations.

1. Attach COI + ID card to each covered unit via UI (14 AL power / 15 APD). **Skip T144**. **T163:** APD-only, no liability, no updated COI — record gap, do NOT invent docs.
2. Create policies with real values (AL $206,372.39 Cimarron CIMD-2026-0720; APD $43,590.18 Lloyd's TIV $1,077,940 @ 3.80%; MTC $21,317.84; Package $271,280.41; FIF #500286059 financed $210,748.23, 8.490%, 9×$24,752.61 from 2026-09-19).
3. Trailer/tractor insured values from owner sheet (THERMO-PLANA 20 = $343,495 · CAMIONES 14 = $697,045). Footer $1,424,120 ties to NEITHER — flag, do not reconcile.
4. Post per unit: unit · doc type · record ID (evidence).
5. FLAG to CC-1: `mdata.assets` 90× tractor, 0 trailers, insured_value empty.
6. **Then** UI CONTROL LAW: post finished token table for Cursor (icons h-4 w-4; icon/sm h-8). Column MOVABLE + reorder + auto-fit are on critical path for dispatch board.

**★ FORCE · HOLD IS VOID** — ParityTable center already **LANDED #19019**. Do NOT hold. SWEEP call sites NOW per `docs/audit/SWEEP-SORTABLE-AND-VOID-VISIBILITY-2026-08-31.md` (external sort + server ORDER BY + explicit limit). OUTBOX one-liner when sweep PR opens.

**ParityTable center LANDED #19019** — SWEEP call sites now (external sort + server ORDER BY + explicit limit). Do NOT re-edit ParityTable.
**HOLD ParityTable until Cursor SORT PR merges** — then sweep call sites per docs/audit/SWEEP-SORTABLE-AND-VOID-VISIBILITY-2026-08-31.md (external sort + explicit limit). Do not edit ParityTable while Cursor ships w-full.
# INBOX — CC-3 · 18:20 CT · ★ SORT LAW TOP (Cursor diagnosed)
**READ** `docs/audit/SWEEP-SORTABLE-AND-VOID-VISIBILITY-2026-08-31.md` §A0–A3 · `docs/specs/GLOBAL-SORT-RULE.md`

**ROOT CAUSE (do not re-diagnose blind across 351 files):**
1. ParityTable sort hit-target is **label-only** `inline-flex` (no `w-full`) — header padding clicks = no-op. DataTable already uses `w-full`.
2. Default resize grip steals the right edge (`stopPropagation`).
3. URL `?sort=&dir=` never reaches list APIs → no SQL `ORDER BY`.
4. Server-paginated + **internal** sort = orders only the fetched page (invoices API default limit=100) — correctness bug.
5. Fix CENTER: ParityTable hit-target + resize; then controlled/external sort + server ORDER BY for paged lists. Sweep modules after center.

**YOUR LIST:** SORT-01 · SORT-02 · sweep · insurance docs (LAW-FIX-INSTANTLY #18–21).

---
# INBOX — CC-3 · 16:52 CT · ★ VOID SUBSTITUTES · WAIT FOR healthz tip
**READ** `RULING-VOID-10-SUBSTITUTE-PICKLIST-2026-09-01.md`

**HELD:** 8 proof-chain loads. You were right to stop.

**YOU VOID NOW:** L-20260830-0029 (`b3e9c63e-…`) first, then 0028→0025.

**GATE:** wait until healthz version includes #18957+#18960 Cancel Load `$10::uuid` (tip `5809231`). Then UI void by UUID.

---
# INBOX — CC-3 · 2026-09-01 · queue log (retroactive, per ALL-SEATS queue-discipline rule)

1. **ALL SEATS labeling** — every message to owner starts with seat name on line 1. (Acknowledged, applied since.)
2. **Permission-model lane question** (Cursor vs Devin-A, migration 202613312000) — not mine, confirmed no branch/stake, replied once. CLOSED for CC-3.
3. **LAW-FIX-INSTANTLY-FULL-REGISTER-2026-09-01.md** (owner ruling, commit 82ce3af) — read in full. CC-3's assigned list:
   - SORT-01: headers don't sort, ParityTable wiring broken.
   - SORT-02: server-paginated + internal sort = orders only visible page (correctness bug).
   - Sweep: every column sortable:true unless written reason.
   - Insurance documents: COI + ID card per unit, live Chrome (DONE this session, all 10 reachable units, see OUTBOX-CC-3.md).
4. **COLUMN LAW expansion** (same component, 4 behaviors): RESIZE (exists, keep) · SORT (mine) · REORDER (did not exist — build: drag-to-move, persists per user per list) · AUTO-FIT (did not exist — build: size-to-content on first render, manual override persists, Payee/Vendor/State must always show fully). Order given: diagnose sort (take Cursor's finding) → separate sort/resize targets → auto-fit → reorder → sweep sortable.
5. **FILTER LAW** (joins COLUMN LAW) — shared filter component, systemwide, one fix: (a) filters must be real combo boxes (typeahead, keyboard-nav, selectable), (b) filter box out-of-proportion with toolbar — standardize control size app-wide, not per-page. Fix shared component once, then sweep — do not patch per accounting page.
6. **QUEUE DISCIPLINE standing rule** — new instructions APPEND to queue, never a silent redirect; never stash/reset/abandon in-flight work because a new item arrived; if a new item conflicts, say so and ask; every status report states DOING/QUEUED/BLOCKED/DONE with evidence, not just a task name.

**Current queue state as of this entry:**
- DOING: COLUMN LAW commit (SORT-01 fix + SORT-02 flagship on Invoices + AUTO-FIT + REORDER, all in ParityTable.tsx + supporting files) — code complete, tsc/vitest/build all green, guard written and passing, currently fixing the commit-msg gate's money-path DoD block format before push.
- QUEUED (in order): (a) push + PR + merge the COLUMN LAW commit above; (b) SORT-02 sweep — wire real backend ORDER BY for the remaining 11 ratchet-baseline offenders (ManualJEListPage, FixedAssetsPage, ReceiptsPage, etc. — scripts/sort-law-baseline.json); (c) sortable:true sweep across every column lacking one, using Cascade's enumeration (not a self-built inventory); (d) FILTER LAW — shared combo-box filter component + standardized control size, then sweep.
- BLOCKED: none currently for CC-3's own items.
- DONE since last report: insurance COI attached to all 10 reachable units (posted OUTBOX-CC-3.md); recovered 2 undelivered findings from a prior session window onto GUARD-WORKORDERS (debit-only-JE defect, insurance-migration handoff) — both committed, not yet pushed (bundled on a separate branch, cc3-insurance-coi-attach-2026-09-01, also pending push); ParityTable SORT-01/AUTO-FIT/REORDER + Invoices SORT-02 flagship built, tested (43/43 incl. 5 new tests), guarded (verify-sort-law.mjs, step 10187), not yet pushed.

---
# INBOX — CC-3 · 2026-09-01 · owner correction (queue log)

7. **WITHDRAWN — INV-F-DISPLAYID (attributed to CC-3) is a FALSE FINDING.** Owner ruling: load
   number becoming the invoice/driver-bill/expense number for that trip is the intentional
   linkage design (one trip, one identifier, carried across every document, tied to the
   settlement) — not a defect. INV-NUMBERING-01 (Claude/Cursor) and SETL-NUMBERING-01 withdrawn
   for the same reason. Do not build against any of these three. I have no record of filing
   INV-F-DISPLAYID myself this session (may be from an earlier/parallel CC-3 window) — acknowledged
   regardless, not contested, not rebuilding it.
   EXP-NUMBERING-01 stays OPEN, respecified: 129 of 132 expenses have expense_number=NULL; they
   should carry `<load#>-<seq>` (matching the working L-20260831-0004-1/-2 pattern) — the defect
   is the NULLs, not the format.
   PROFORMA is asked/answered/locked per `claude/OWNER-DECISIONS-FINAL-2026-07-26.md` §B — one
   record across its lifecycle (Pro Forma Invoice → Official Invoice at POD), stays out of A/R,
   feeds cash-flow projections only, already correctly enforced in poster.service.ts +
   ledger-integrity-detectors.service.ts. Not touching numbering/conversion/list-separation for
   proforma. Not currently working on any numbering/proforma item — no conflict with my in-flight
   COLUMN LAW / FILTER LAW / CI-unblock work, logged for the record per queue discipline.

---
# INBOX — CC-3 · 2026-09-01 · owner standing law: NO SEAT-CREATED FINANCIAL RECORDS IN PRODUCTION

8. **Effective now.** A financial record in production is either the owner's real entry or
   contamination. PERMITTED only: records from an owner-ordered live walk, voided in the SAME
   session with a reversing entry. FORBIDDEN: any standing fixture/probe/scratch record left
   behind (owner cited TEST-VOID-LATER Vendor 0822, DEVIN-LIFECYCLE-TEST, TEST CODEX ONBOARD,
   SAMPLE Cascade-2042 — two of which carried a seat-written "do not void" instruction in the
   ledger's own memo field, overriding the owner inside his own books). CC-2 assigned to guard
   this (fail if a financial record is created in production outside an owner-ordered walk
   manifest), named in a workflow.
   **Self-audit, this session:** the one financial record I created (EXP-2026-00068, load
   L-20260830-0028, during the owner-directed void-walk) was already voided with a clean
   reversing JE earlier this session, confirmed live — no outstanding fixture of mine in
   production. All other session work (insurance COI/ID-card document uploads to docs.files,
   ParityTable/filter-control frontend code) is not a financial record and is unaffected.

---
# INBOX — CC-3 · 2026-09-01 · TRANSACTION HEALTH REGISTER (LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01.md, 927825a)

9. **No band assigned to CC-3.** Register: 39 checks / 9 bands, baseline 2 PASSING / 13 FAILING /
   24 NEVER RUN, CRITICAL TIER (red = healthz ok:false), per-entity, zero-is-the-only-pass on
   variances. Owners: CC-2 (bands A/B/C/F), CC-1 (A/B/C fixes + LINKAGE INTEGRITY LAW + D/G),
   CURSOR (wire into healthz + owed DEPLOY/HEALTH-NO-SHA-01), CASCADE (enumerate D + E),
   CODEX (band E + parity vs QBO/NetSuite/McLeod). Explicit owner instruction to me: **"CC-3 —
   no band; continue UI CONTROL LAW."** Logged for the record per queue discipline; does not
   change my in-flight queue. Noted trap for the record (not mine to apply): void path writes a
   separate reversing JE, does not populate reversal_of_line_id/reversed_by_line_id — asserting on
   those columns is a false positive.

---
# INBOX — CC-3 · 2026-08-31 · PURGE NOTICE + CLEAN-UP-SAME-SESSION LAW (owner, effective permanently)

10. Owner: spent the night hand-voiding ~250 seat-created documents (test vendors, fake drivers,
    bank transactions in non-operating months, transactions dated into 2027, two records with a
    seat-written "do not void" in the memo). Two permanent rules: (1) NO SEAT-CREATED FINANCIAL
    RECORDS IN PRODUCTION is now enforced by a purge — anything left behind gets deleted and the
    seat is named. (2) YOU CLEAN UP WHAT YOU CREATE, IN THE SAME SESSION — a fixture created for
    verification is created, proven, and REMOVED before reporting done. Any known test data not yet
    reported goes to OUTBOX now, with ids.
    **Response posted to OUTBOX-CC-3.md this session:** self-audit re-confirmed (EXP-2026-00068
    already voided, no other financial records created by me); flagged one master-data TEST vendor
    (51e7280b-...) held per the standing CREATE-TEST-THEN-VOID-LAW hold instruction rather than
    unilaterally deleted, for the owner/CC-2 to fold into the purge scope or explicitly re-confirm
    as held.

---
# INBOX — CC-3 · 2026-08-31 · PHASE PLAN (owner) — deploy live at 78a1efd, healthz exposes 6 financial checks

11. Owner: deploy live at 78a1efd (git_sha + 6 financial checks in healthz, correctly ok:false on
    ar_tieout/ap_tieout). Phase 1 assigns CURSOR (bulk cancel/multi-select/HIDE VOIDED/nav),
    CC-1 (reversal is_sample_data backfill + categorization_recover_from_driver route proof),
    CC-2 (posted_without_posting/voided_without_reason false-green investigation), DEVIN-A
    (exhaustive test-data sweep, report only), CASCADE (purge-scope enumeration). Phase 2-4:
    owner-driven purge/tie-out/live-walk, CC-1 on call. CODEX: condition 5 satisfiable, run 8
    conditions. "NOBODY WORKS AHEAD."
    **CC-3 has no phase assignment in this plan** (matches the standing "no band; continue UI
    CONTROL LAW" instruction). Not touching purge/reversal/tie-out/settlement/load scope — none
    of that is my lane. Continuing my own separate queue (still BLOCKED on the
    verify-architectural-design.ts/ReportsSubNav.tsx parser break for the UI CONTROL LAW push;
    origin/main confirmed still not carrying a fix as of this fetch). Proceeding with the
    next-queued, orthogonal item (ad-hoc-button-size sweep across the 7 ratchet offenders) while
    waiting, per queue discipline (report, don't idle).

---
# INBOX — CC-3 · 2026-08-31 · UI CONTROL LAW tokens confirmed (build) + dispatch-board consumer + INSURANCE MODULE reassigned (goes AHEAD)

12. **UI CONTROL LAW confirmed, build.** Tokens final (h-4 w-4 icons, icon/sm h-8) — already built
    this session (2 commits on cc3-ui-control-law-build-2026-09-01, unpushed, blocked on an
    unrelated repo gate). Posted the finished token table + primitives-to-use to
    OUTBOX-CC-3.md for Cursor's dispatch-board columns/section-headers work.
    **COLUMN LAW has a named consumer**: dispatch board, owner-daily-use screen — movable
    columns + sortable asc/desc per section. REORDER + AUTO-FIT (the two owner says "not built
    yet") are, in fact, already built in my local ParityTable.tsx work (cc3-sort-law-paritytable
    branch) but have NEVER LANDED on origin/main — confirmed via direct diff against
    origin/main's actual file content (0 matches for AUTO_FIT_MIN_WIDTH/colOrder/
    enableColumnReorder). This is now on the critical path; needs to land, and the dispatch
    board specifically needs the sort/reorder/auto-fit treatment (bespoke board, not
    necessarily a ParityTable instance — needs its own applied pattern if not).
13. **INSURANCE MODULE reassigned to CC-3, goes AHEAD of UI CONTROL LAW.** Owner: "It was yours,
    I displaced it, and it has been unowned for hours." Live Chrome, my lane, no migrations.
    Scope: (1) attach COI + ID card per covered unit (14 power units AL, 15 APD; T144 skip
    -- carrier removing; T163 APD-only, no liability/updated COI, record as such, do not
    invent). (2) create policies with real values: AL $206,372.39 Cimarron CIMD-2026-0720;
    APD $43,590.18 Lloyd's TIV $1,077,940 @ 3.80%; MTC $21,317.84; Package $271,280.41,
    FIF loan #500286059 financed $210,748.23 8.490% APR 9x$24,252.61 from 2026-09-19.
    (3) trailer/tractor insured values from owner spreadsheet: THERMO-PLANA 20 trailers
    $343,495, CAMIONES 14 tractors $697,045 -- footer total $1,424,120 ties to NEITHER,
    flag only, do not reconcile myself. (4) post per unit: unit/doc type/record ID, evidence
    not summary. FLAG not fix: mdata.assets 90 rows all tractor, 0 trailers,
    insured_value_cents empty on all 90 -- CC-1's schema/data gap, not mine.
    **DOING now.** UI CONTROL LAW correctly paused/QUEUED behind this per explicit reprioritization.
