# LEAD CENSUS — Claude Lead · 2026-09-11 15:40 Central (20:40 UTC)

Live API `953e4fd` (built 20:02Z, direct curl). origin/main tip `f7667af33f`. Open PRs: 0. Neon USMCA (bypass lucia, 20:36Z): loads 107 · active non-cancelled/draft loads with tour_id NULL = **3** · driver_bills 100 · `settled_in_settlement_id` populated **0** · bills linked via `settlement_lines.source_driver_bill_id` **93**.

| Seat | NOW (deadline 21:30 UTC unless noted) | Last self-report on bus | Lead verdict | Surrender |
|---|---|---|---|---|
| **Devin** | Kanban cross-column drag fix (loaded cards) — `DispatchKanban.tsx` | none on OUTBOX-DEVIN since 09-06 | NOT STARTED on the bus; no PR | CC-1 |
| **Devin-B** | Kanban one-row-per-unit build | none for this task | NOT STARTED on the bus; no PR | Cursor |
| **Codex** | System-wide Settlement/Presettlement column sweep (Bills excluded) | CLAIM-RESERVE 11297 merged #21818 20:01Z | WIP — claim only, no code PR yet | CC-2 |
| **GPT** | Bills settlement-number column + dead `settled_in_settlement_id` join | OUTBOX-GPT WIP, base 953e4fdee | WIP — no PR yet. Neon confirms the premise: 0/100 bills have settled_in populated, 93 link via settlement_lines | CC-1 |
| **CC-1** | INBOX-CC-1 ROW 0 (reimbursement per-type GL) → ROW 6 | not re-verified this census | queue untouched per handoff | — |
| **CC-2** | REG-028/030 sign-inversion backfill (#e584272c 18:29Z "complete") | OUTBOX-CC-2 | DONE claim not yet re-measured by lead | — |
| **CC-3 / Cursor / Cascade / Devin-A** | per their INBOX | not re-verified this census | — | — |

Every DONE is re-measured by the lead against Neon + the deployed sha before ✔. Silence past a deadline = surrender.
