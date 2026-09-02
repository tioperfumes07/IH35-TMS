# NOW-ONE-SOURCE · OWNER URGENT · 2026-09-02 17:35Z

Pre-flight before any built/not-built claim: open PRs + branch tips + Neon under `bypass_rls` — never judge from main alone.
USMCA only. Never POST Book Load. Never flip `autofill_allowed` in the DB.

`origin/main` tip = `21aa0ba` (#19691 CC-2 chrome verify). GO-16 Rev C miles = `#19689` @ `9945b6fc` (ancestor of tip).

## Production blockers that remain
| Item | Owner | State |
|------|-------|-------|
| **GO-22 pre-settlement / settlement** | **CC-1** | Build against **tour close law** (Jorge 17:20Z). Tour = leave Laredo home → return home. Home = 23918 Mines Rd, Laredo TX 78045. Closeable when truck in geofence with no load. SB leg does not close. Deadhead-to-yard prompts. Loan/debt blocking pop-up at close (config: 5% floor vs full — Jorge decides). B1 fuel = truck cost, never driver deduction. |
| J1 type/picker ratchet | CC-2 | ~1015 off-scale remaining + Chrome-prove load **13508** |
| C1 UUID sweep | CC-3 | After Cascade recount (#19681 open) |
| Deploy tip current | Cursor lead | API live `9945b6f` (GO-16); tip `21aa0ba` — batch deploy, not per-merge |

## DONE — do not re-cut / do not reassign
| Item | Proof |
|------|-------|
| Miles GO-16 Rev C | #19689 @ 9945b6fc · live API `9945b6f` |
| N1 expense | #19641 |
| N1 bill + bill-payment from a load | #19676 |
| A3/B12 Book Load banner | Codex CLOSED |
| B2 / B7 / geocode gate | Shipped |

**Discarded bad re-balance:** do **not** move bill/bill-payment to CC-3. N1 is complete. CC-1 stays on GO-22 only.

## Seat NOW
| Seat | NOW |
|------|-----|
| **Cursor** | Lead · bus ACK · deploy parity when batch · scoreboard freshness · **not** GO-22 · **not** J1 |
| **CC-1** | **GO-22 only** — tour close law above · `lib.trace_counters` match `LD`/`LOAD` · kill 2 sample drivers · ask Jorge only on 5% floor vs full deduct |
| **CC-2** | Chrome-prove load **13508** (report FIXED/NOT FIXED) · keep J1 · #19691 merged |
| **CC-3** | C1 UUID sweep after Cascade count · Not N1 · Not miles |
| **Codex** | Next GO-23 row · do not hand-edit scoreboard |
| **Cascade** | FINDINGS only · #19681 · re-derive C1 for CC-3 |

## Open PRs — do not collide
#19681 Cascade hunt2 · #19485 CC-1 escrow board · #19305 tracker sync · dependabot

## Done bar (owner Chrome)
Load **13508**: miles fill with labels → type-over stamps Operator entered → expense/bill/pay already work → assign driver → numbered pre-settlement contains that load.
