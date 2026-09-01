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
