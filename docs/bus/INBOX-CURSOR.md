# ★ OWNER REWRITE · 2026-09-01T02:36Z
**DESIGN FILE:** `docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md` · rewrite: `docs/bus/OWNER-REWRITE-DISPATCH-AND-CASCADE-VOID-2026-09-01.md` · NO Cascade Void code until Jorge APPROVED.

**DISPATCH BOARD (owner words — KEEP cities · ADD PU/DEL date+time · LIVE only + HISTORY tab · movable+sortable · real filters/search · CC-3 tokens).** Cascade Void wait APPROVED. Multi-select today = Reverse (settlements) / Cancel loads — not labeled Void until cascade ships.

# ★ OWNER MASTER FANOUT · 2026-09-01T02:12Z · live=`8112092`

**VERIFY (Cursor lead, independent of Claude):** Phase-1 bulk Cancel loads + settlements Reverse + Hide voided/cancelled + Receive Payment nav are on live `8112092` (#19042/#19036/#19052). Owner "no multi-select void" = naming/UX gap (Reverse/Cancel ≠ button labeled Void) + Cascade Void not built.

## CURSOR ORDER (do not work ahead of Phase plan)

### BLOCKING / DESIGN FIRST
1. **CASCADE VOID** — design posted: `docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md`. **NO CODE until Jorge APPROVES.** Tree from CC-1 API only.
2. After approve: build dialog + entry from every money/load surface; pre-validate; one reason; atomic FK order; per-doc reversing JE.

### STILL YOURS (queued — after design approval / Phase 1 stand-by)
3. **DISPATCH BOARD (5.1–5.4):** KEEP PU/DEL city; ADD PU date/time + DEL date/time from `mdata.load_stops` (appointment vs FCFS); LIVE loads only + History tab; per-section headers/sort/filters; movable + sortable columns — consume **CC-3 UI CONTROL LAW tokens** (no third scale).
4. **SEARCH LAW (2.5–2.6):** shared builder; amounts/load/PO/BOL/date/status; true data. (Board search today uses `load_number`+customer+city — `display_id` ILIKE fragment is NOT the live clause.)
5. **VOID-REASON-CATALOG-01** dropdown from `catalogs.void_reasons`.
6. **UNIT DEACTIVATION (9.1):** deactivate non-insured; keep T144; T163 + coverage-gap flag; post unit/action/before/after/id; never deactivate active `policy_unit`.
7. **PERMISSION WIRING (10.4):** replace `requireVoidCancelExecutor` role strings with `identity.has_permission()`; keep `PERMISSION_MODEL_ENFORCED` OFF until owner flip; post every call site.
8. Hide-voided · Receive Payment · accounting Create consolidate — report DONE vs OPEN honestly.

### STAND BY
Phase 2 = owner clears settlements/loads. Do not start Phase 3/4/5 alone.

**★ PHASE PLAN (owner 2026-09-01T02:03Z) — PHASE 1 ONLY. Do not work ahead.**

PHASE 1 NOW:
- CURSOR: bulk cancel · settlements multi-select · HIDE VOIDED · Receive Payment nav (this seat)
- CC-1: (a) reversals inherit is_sample_data — backfill 233 written tonight BEFORE any purge. (b) categorization_recover_from_driver — prove THROUGH THE ROUTE not SQL.
- CC-2: posted_without_posting + voided_without_reason are GREEN but 3 unposted docs + INV-2026-00024 exist — determine fix vs narrow scope; REPORT. Green check missing known violation = worse than no check.
- DEVIN-A: exhaustive test-named GL/driver/customer/vendor/unit sweep — report only, delete nothing.
- CASCADE: enumerate EVERY is_sample_data=true + dependents in FK order for CC-1 purge.
- CODEX: condition 5 SATISFIABLE at live 78a1efd — run eight conditions; only you lift freeze.

PHASE 2+: owner clears settlements+loads → CC-1 purge (TB identical or rollback) → tie-outs $0 → owner real walk. NOBODY works ahead. Done with Phase 1 → report and STAND BY.

# INBOX — CURSOR · 16:40 CT · ★ VOID-10 ONLY
Owner+Claude ACK: SETL-GRID withdrawn · SETL-UX-01 LOW parked · Cascade red stays red · Codex OPEN=0 stood down · pick list accepted.

**NOW:** merge continuously · keep Devin-A + CC-3 unblocked · live-void L-0002 in order (invoice→bill→line→load) · **nothing else**.
