# PRE-PURGE SNAPSHOT — AUTH-091 — captured before any deletion
**2026-09-28 11:00:18 UTC (06:00 CT) · USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`**
Measured with `SET LOCAL ROLE neondb_owner` + `SET LOCAL app.bypass_rls = 'lucia'`.
This is the only record of the before-state. Every post-purge claim is checked against THIS.

## THE INVARIANTS — these must be IDENTICAL after the purge
| invariant | before |
|---|---|
| **total debits** | **$3,008,935.08** |
| **total credits** | **$3,008,935.08** |
| **trial balance** | **BALANCED to the cent** |
| JEs with zero postings | **0** |
| live expenses | **532** |
| live bills | **90** |
| bill payments | **130** |
| live factoring advances | **89** |
| live bank transactions | **911** |
| settlements | **66** |
| active settlement lines | **325** |
| loads | **149** |
| real units (non-sample) | **179** |
| real drivers (non-sample) | **263** |

**If any line above changes, the purge deleted something it should not have. ROLL BACK.**

## WHAT SHOULD CHANGE — and only this
| table | before | expected after |
|---|---|---|
| journal_entry_postings | 8,021 | lower (voided documents' postings removed) |
| journal_entries | 3,567 | lower ONLY by husks with zero postings AND zero referrers |
| expenses total (live + voided) | 1,593 | **532** — the 1,061 voided gone |
| `maintenance.pm_auto_wo_log` | **34,321** | **0** — 100% of it is sample-unit rows |
| sample units / drivers / customers / vendors / equipment | 17 / 10 / 16 / 10 / 5 | 0 / 0 / 0 / 0 / 0 |
| voided rows across 26 tables | ~2,711 | 0 |

## NOTE ON MOVEMENT SINCE THE EARLIER DRY RUN
CC-2's dry run read a trial balance of $2,998,960.65 across 7,817 postings. This snapshot reads
**$3,008,935.08 across 8,021 postings** — the book grew by $9,974.43 and 204 postings in the
interval, because the settlement-seeding fork has been posting 5817/5818/5819 and writing
settlement-line miles (113 → and climbing). **That is expected and correct.**
**CC-2 must re-measure the trial balance INSIDE its own transaction immediately before deleting
and compare against THAT, not against the older dry-run figure or this one.** A moving book is
not a reason to stop; using a stale baseline is.

## THE THREE THINGS THAT MUST BE TRUE WHEN IT FINISHES
1. Trial balance still balanced, and total debits = total credits = whatever it reads at the
   moment the transaction opens.
2. Zero orphaned postings. Zero JEs with zero postings.
3. Every live count in the first table above unchanged.
