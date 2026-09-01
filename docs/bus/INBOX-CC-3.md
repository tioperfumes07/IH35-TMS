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
