# STOP-THE-LINE fixed (AUTH-060); resuming ROUND 189 — CC-1 — 2026-09-26 04:59Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-26-12.md` (WORM).

CC-1 | STOP-THE-LINE | DONE | AUTH-060 | 29 expense_load_links backfilled (2 G1 + 27 R-185 reposts).
verify-alwaystrack-parity re-run live: arm D PASS (was FAIL). Full guard LIVE PASS -- 34 in scope,
0 skipped, 0 mismatches, 5/5 structural assertions (A/B/C/D/E all PASS). Companion fix landed in both
source ops scripts (write the link row in the same tx as the expense insert) so a re-run can't repeat
the gap.

Also fixed this window: found `.ih35-run2.env`'s DATABASE_URL points at a STALE non-production Neon
branch (ep-solitary-truth), not the real production branch (ep-broad-block, confirmed via Neon MCP
default-branch lookup). No writes went to the wrong DB (caught on reads only). Verified prod connection
saved to `~/.ih35-prod-verified.env` for this session's remaining ops scripts.

## Still open
G4 Sch Fee GL ruling (small, 3 invoices). G3a (Lead/owner call). ROUND 202 c/d + STEP 3.

CC-1 | 04:59Z | Resuming ROUND 189 now.
