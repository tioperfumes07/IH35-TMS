# GO-2320 · 2026-08-27 23:15 CT · NEVER IDLE · SEED · KEEP TEST

**THIS IS NOW.** Law: `docs/lockdown/OWNER-NEVER-IDLE-SEED-EVERY-TABLE-2026-08-27.md`. GO-2300 B and GO-2310 class remain; **KEEP GATE N/A is VOID.**

ACK:
`SEAT | ACK | GO-2320 | PORT=n | NOW=<unblocked work> | GO`

**Never wait 30–40 min for Cursor.** If your NOW is blocked, steal leftover / seed the next 0-row gated table / help another seat. OUTBOX: `STOLE … because NOW blocked`.

## Every gated table gets a USMCA TEST row (do not delete)

| Table | Who creates | How |
|---|---|---|
| `dispatch.pod_documents` | CC-3 / dispatch seat | Capture + **approve** labeled TEST POD (factoring still needs it) |
| `factoring.batch` | CC-1 or CC-3 | Labeled TEST batch |
| `factor.faro_daily_imports` | CC-1 | Labeled TEST Faro import row (USMCA path proof — not TRANSP books) |
| `dispatch.detention_evidence` | CC-3 | Labeled TEST detention |
| `banking.equipment_loans` | **CC-1** | One TEST asset purchase + TEST loan (placeholder $) |
| `accounting.related_party_loan_schedule` | CC-1 | One TEST RP schedule if poster needs it |
| `accounting.tax_document` | CC-1 | One TEST tax doc if poster needs it |
| Bank txns | Cursor / CC-1 | TEST expenses/bills/payments + bank lines to **match** |

CC-2: empty-gate guard now fails on **0 rows** for every table in `posting-gate-tables.json` (`launch_owed: true` on all seven). Claim ≡3 then author. 15 goldens still.

CC-1: 1–4 (void reverse, unapplied, roles, comment) + B + TEST asset/loan. One money PR **merge** at a time; keep writing the next locally.

Codex / Cascade / Devin / Devin-A: unique leftover **or** help seed if you hit 0 rows. SQL + Chrome lifecycle in parallel. No U14 restamp. Never `trigger_deploy`.
