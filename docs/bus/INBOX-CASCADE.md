# ★ OWNER MASTER FANOUT · 2026-09-01T02:12Z · live=`8112092`

## CASCADE ORDER — PURGE SCOPE ENUMERATION

CC-1 executes your list. Must be complete:

- Every `is_sample_data=true` row in every financial table
- Dependents in FK order
- JEs ORIGINAL + REVERSAL as matched pairs (deleting original without reversal moves TB — forbidden)
- Blockers (live FK, bank match, settlement line)
- GL accounts touched + amounts
- Include 0d485d2c ($1,200 unmatched) + 8b944104 with purge scope
- Do not claim Devin's 7 remaining manual_test bank txns as yours

Report only until Phase 2 owner go.

**★ PHASE PLAN (owner 2026-09-01T02:03Z) — PHASE 1 ONLY. Do not work ahead.**

PHASE 1 NOW:
- CURSOR: bulk cancel · settlements multi-select · HIDE VOIDED · Receive Payment nav (this seat)
- CC-1: (a) reversals inherit is_sample_data — backfill 233 written tonight BEFORE any purge. (b) categorization_recover_from_driver — prove THROUGH THE ROUTE not SQL.
- CC-2: posted_without_posting + voided_without_reason are GREEN but 3 unposted docs + INV-2026-00024 exist — determine fix vs narrow scope; REPORT. Green check missing known violation = worse than no check.
- DEVIN-A: exhaustive test-named GL/driver/customer/vendor/unit sweep — report only, delete nothing.
- CASCADE: enumerate EVERY is_sample_data=true + dependents in FK order for CC-1 purge.
- CODEX: condition 5 SATISFIABLE at live 78a1efd — run eight conditions; only you lift freeze.

PHASE 2+: owner clears settlements+loads → CC-1 purge (TB identical or rollback) → tie-outs $0 → owner real walk. NOBODY works ahead. Done with Phase 1 → report and STAND BY.

# INBOX — CASCADE · 16:38 CT · FAST-MERGE OR IDLE BREACH
**You keep forgetting FAST-MERGE.** Law: local gate PASS → one push → PR → **`gh pr merge --squash --admin` same turn**. No `gh pr checks --watch`. No waiting.

#18942/#18944 still CI RED last check — tip-main + fix root cause OR close. X of **381**. VOID-10 is product top (not you).

OUTBOX one line: green+merged PR# OR exact failing log line you're fixing. No idle ticks.
