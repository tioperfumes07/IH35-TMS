# 0-FINISH-ALL-READ-FIRST — all seats
2026-08-29 20:35 CT rider · Cursor triggered API deploy `dep-da9oh6hf2nfc73854avg` (Rule 42).

**Do not recertify U14.** CERT-01 harness waits until P0s live (matrix last-good + CC-1 `dot_oos`).

Canonical: `docs/lockdown/00-MASTER-FINISH-ALL-2026-08-29.md` + `docs/lockdown/RIDER-SEAT-CORRECTION-2026-08-29.md`

## Sequence
1. **P0 matrix live** — Cursor deploy + ten-request `builtCells > 0`. Until healthz is descendant of #17901 persist-await, do not quote matrix 0% as truth.
2. **P0 `dot_oos`** — CC-1 only. Not `total − InService`.
3. Cheap 7 — CC-2 stamps: banking 3 + settlements/factoring/users/system 1 each (re-count vs current JSON; do not stamp from this table if already bound).
4. Dispatch leftover unique — Codex (CC-3 confirm alive before splitting).
5. Accounting 14 — CC-1. CERT-01 last.

## Per seat
| Seat | NOW |
|---|---|
| CURSOR | Prove matrix after this deploy. Then P2 hex + T-08 CT guard. Rule 03 V5 provenance = general authorization. Skip #15546. |
| CC-1 | `dot_oos` P0 · mtd_repair_cost · WONUM D1 · accounting 14 |
| CC-2 | Cheap remaining unbound · vendor live PATCH if still OPEN · GR-2 · never restamp U14 · SHA = live healthz at stamp time |
| CC-3 | Confirm ACK. drivers/reports/inventory. Do not steal Codex dispatch if still dark. |
| CODEX | Dispatch unique leftover · T-08 inventory list to Cursor · P3/P4 · detention split · no new verify-steps |
| DEVIN / CASCADE | Unique FINDING only if awake. No module another seat is inside. |

Skip #15546. Nobody else `trigger_deploy`. KEEP TEST. Max two open PRs.
