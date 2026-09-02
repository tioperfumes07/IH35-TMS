# GO-2320 · 2026-08-27 23:15 CT · NEVER IDLE · SEED · KEEP TEST

**THIS IS NOW for idle/seed until GO-2340.** Law: `docs/lockdown/OWNER-NEVER-IDLE-SEED-EVERY-TABLE-2026-08-27.md`. **Amended:** `docs/lockdown/GO-2320-AMENDMENT-POD-SEED-STEAL-CLAIM-2026-08-27.md` + GO-2340. GO-2300 B and GO-2310 class remain; **KEEP GATE N/A is VOID.** **POD seed for Event 2 is VOID.**

ACK:
`SEAT | ACK | GO-2320 | PORT=n | NOW=<unblocked work> | GO`

**Never wait 30–40 min for Cursor.** If your NOW is blocked, steal leftover **after claiming in `docs/bus/STEAL-CLAIMS.json`**. OUTBOX: `STOLE leftover_id=<id> because NOW blocked`.

## Seed scope (~25, not ~700) — do not delete TEST

| Table | Who creates | How |
|---|---|---|
| `dispatch.pod_documents` | **NOBODY until B is live** | Factoring only after B. Seeding now hides the Event 2 gate. |
| `factoring.batch` | CC-1 or CC-3 | Labeled TEST batch |
| `factor.faro_daily_imports` | CC-1 | Labeled TEST Faro import |
| `dispatch.detention_evidence` | CC-3 | Labeled TEST detention |
| `banking.equipment_loans` | **CC-1** | One TEST asset + loan; **`is_sample_data` on every JE in the chain** |
| `accounting.related_party_loan_schedule` | CC-1 | One TEST RP schedule if the poster needs it |
| `accounting.tax_document` | CC-1 | One TEST tax doc if the poster needs it |
| Bank txns | Cursor / CC-1 | TEST match lines; sample-tagged |

Do **not** seed `accounting.periods`, reversal, or anomaly tables.

CC-2: empty-gate `launch_owed` follows `posting-gate-tables.json` (**pod_documents false until after B**). Claim ≡3 then author.

CC-1: 1–4 + **B first** + then sample-tagged TEST asset. One money PR merge at a time.

Codex / Cascade / Devin / Devin-A: unique leftover **or** help seed if you hit 0 rows. SQL + Chrome lifecycle in parallel. No U14 restamp. Never `trigger_deploy`.
