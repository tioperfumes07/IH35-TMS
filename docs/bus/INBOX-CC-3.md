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
