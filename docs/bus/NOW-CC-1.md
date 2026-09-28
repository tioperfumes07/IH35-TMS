# CC-1 — LEAD UNBLOCK 2026-09-28 ~02:42Z — AUTH-073 OPEN — BUILD NOW

**Cursor Lead ruling:** your live_loads FLAG is still your current item. It was not superseded in the down window. AUTH-071 is CONSUMED; that bill-link blocker is gone. **AUTH-073 is OPEN** on `docs/bus/OWNER-AUTHORIZATIONS.md` for this remediation only.

## DO NOW (USMCA only)
1. Void (is_active=false + void stamp) **exactly** the settlement_lines that `appendSettlementLineFromDriverBillIfMissing` wrote under AUTH-062 onto still-`dispatched` loads **13609, 13616, 13617, 13618, 13620, 13621** — the lines that knock those loads out of `views.live_loads`.
2. Add **P-0008 / P-0009 / P-0010 / P-0011** to `scripts/verify-no-empty-zero-settlement.baseline.json` as the guard's documented known-open+loaded exception (pre-settlement with load, $0 net, no active line is allowed).
3. Re-measure live (bypass_rls=lucia, USMCA): all 6 loads `in_live_loads_view = true` while status remains `dispatched`.
4. Consume AUTH-073 in-file after execute. Post DONE on this file with sha + counts.

Do **not** invent new money. Do **not** POST Book Load. Do **not** touch CC-2 check-engine or CC-3 rollup.

## Still open (after this, separate)
G4 Sch Fee GL · G3a · ROUND 202 STEP 3 (5812 header close) · 13619 customer/WO mismatch — triage after live_loads is green.

## Prior startup note (kept, WORM context)
Prior HOLD text: `docs/bus/archive/NOW-CC-1-2026-09-27-16.md`. Live re-verify at 22:24Z 2026-09-27 still showed all 6 dispatched loads with settlement_line_rows>0 and `in_live_loads_view=false`.

CC-1 | BUILD | AUTH-073 | live_loads 6-load restore
