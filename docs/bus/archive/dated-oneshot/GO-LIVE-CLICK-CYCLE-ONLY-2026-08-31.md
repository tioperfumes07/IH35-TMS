# GO — LIVE CLICK CYCLE ONLY · 2026-08-31 13:36 CT · owner word via Cursor

**Owner:** every real transaction in this cycle must be created **live by clicking** in the app.

## DONE = only this shape
`url` + **UI click/type/submit** + reload + Neon **grade** (read-only).

## FORBIDDEN as DONE (instant FAIL in OUTBOX)
- Neon `INSERT` / `UPDATE` / SQL invent of bills, invoices, expenses, settlements, factoring, escrow, deductions
- API / `fetch` / curl / Postman / “authenticated fetch from browser context”
- env flags / scripts / seed / MCP write as the create path
- Claiming a hop DONE because Neon already has a row from an earlier API/workaround

Neon is **verify after click**, never the writer for product hops.

## Cycle hops that MUST be Live Click (USMCA · Sample/TEST ON)
1. Book Load → dispatch
2. Mark in-transit → delivered → completed_docs
3. Invoice send (UI)
4. Driver bill mint / remint path (UI settle / close-trip / whatever the product button is — **no hand SQL**)
5. Settlement line appears from that UI path
6. Load expenses (Record Expense UI linked to load)
7. Factoring pledge / batch submit UI on those invoices
8. Escrow / deduction appearance from settlement UI (not backfill SQL as “create”)
9. Bank match UI for settlement pay

## Live right now (healthz must be checked each seat)
- App live was `f660bef` at force time — pull + confirm `healthz/shallow` before click
- L-0002 still **0 bills** · L-0004 / L-0017 still **0 settle lines** · **0** of today’s GO-E2E invoices factored · expenses only on L-0004
- Code fix #18830 is live; **data repair = re-exercise UI**, not Neon remint

## Seat NOW
| Seat | Click NOW |
|------|-----------|
| **CC-1** | Live Click settle/remint path on **L-0002** then **L-0004** (and grade L-0017). OUTBOX: url\|clicks\|reload\|bill#\|settlement_id\|line_count. If UI cannot mint → FINDING + still no SQL invent. |
| **Devin-A** | Live Click only on **L-0017** settle re-test (you already flagged B still broken). No fetch. |
| **CC-3** | Live Click **Record Expense** on a completed_docs load that still has 0 expenses (not L-0004). Sample ON. |
| **Codex** | Live Click factoring pledge on a **sent** GO-E2E invoice (L-0010 or L-0004) OR bank-match a **today** `S-20260831-*` with money — not yesterday’s S-20260802. |
| **CC-2** | Grade after each seat’s click OUTBOX — Neon read only. Reject any OUTBOX that admits API/fetch/SQL create. |
| **Cascade** | Navy inventory (no Chrome) — unchanged |

## OUTBOX line required
`SEAT | LIVE-CLICK | hop=… | healthz=… | url=… | clicks=… | reload=PASS|FAIL | neon_grade=… | GO`
