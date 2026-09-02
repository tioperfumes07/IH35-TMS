# NOW-ONE-SOURCE · OWNER URGENT · 2026-09-02 12:00 CT

Pre-flight before any built/not-built claim: open PRs + branch tips + Neon under `bypass_rls` — never judge from main alone.
USMCA only. Never POST Book Load. Never flip `autofill_allowed` in the DB.

## Production blockers that remain
| Item | Owner | State |
|------|-------|-------|
| **Miles GO-16 Rev C** | **Cursor alone** | Built locally on `cursor/go16-rev-c-miles-autofill-c89b` — **PUSH / land** |
| **GO-22 pre-settlement / settlement** | **CC-1** | In progress. One open owner decision (see INBOX-CC-1) |
| J1 type/picker ratchet | CC-2 | 1015 off-scale remaining |
| C1 UUID sweep | CC-3 | Pending Cascade recount |
| A3/B12 Book Load banner | Codex | **CLOSED** (verified) |

## DONE — do not re-cut / do not reassign
| Item | Proof |
|------|-------|
| N1 expense | #19641 |
| N1 bill + bill-payment from a load | #19676 (`BillsReverseSection` + load-scoped PayBillModal) |
| B2 / B7 / geocode gate | Shipped — prior “still greppable” claim was wrong |

**Discarded bad re-balance:** do **not** move bill/bill-payment to CC-3. N1 is complete. CC-1 stays on GO-22 only.

## Seat NOW
| Seat | NOW |
|------|-----|
| **Cursor** | Push + PR + FAST-MERGE **GO-16 Rev C**. Regenerate scoreboard when Codex is blocked by 48h stale gate. Fan-out bus. Never POST. |
| **CC-1** | **GO-22 only** — pre-settlement + settlement + number via `lib.trace_counters` (match `LD` or `LOAD`, never a third). Ask owner before close rule. Kill 2 sample drivers. |
| **CC-2** | Chrome-prove load **13508** the moment miles lands. Keep J1. |
| **CC-3** | C1 UUID sweep after Cascade count. Not N1. Not miles. |
| **Codex** | Next GO-23 row after A3/B12 closed. Scoreboard freshness is Cursor lead job if gate reds on age. |
| **Cascade** | FINDINGS only — re-derive C1 count for CC-3. Never build. |

## Done bar (owner Chrome)
Load **13508**: miles fill with labels → type-over stamps Operator entered → expense/bill/pay already work → assign driver → numbered pre-settlement contains that load.
