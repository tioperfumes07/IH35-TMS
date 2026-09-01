# INBOX-CC-1 · GO-11 P0 NOW

`git pull --ff-only origin main`. Packet: `docs/lockdown/GO-11-USMCA-CLEAN-SLATE-2026-09-01.md`

## TOP
1. **GO-11 EXECUTE (P0)** — USMCA only `5c854333-6ea5-4faa-af31-67cb272fef80`. Manifest `docs/evidence/USMCA-FIXTURE-PURGE-MANIFEST-2026-09-01.csv` **before** any DELETE. Eyeball 34 unmatched bank UUIDs. Delete by id. **No** `ILIKE '%test%'`. Delete SAMPLE/TEST insurance policies listed in the packet (source of fake dispersal). Drivers/vendors/equipment only if zero real children. TRANSP/TRK byte-identical. Do not reset `trace_no`.
2. **Migration collision:** Cursor owns `banking.bank_transactions.is_sample_data` (HH 12–23) after CLAIM **10224** / **202613331950**. If the column is not on `origin/main`, **wait** — do not write a second migration.
3. **GO-02 LIST API** (after GO-11 PR is up, disjoint files OK): `GET /api/v1/insurance/coverage-gaps` still `missing_types[]` → per-type `{coverage_type, status, policy_id, policy_number, expiry_date}[]`. Trailer AL = N/A. Do not invent T144 ACV.
4. **GO-09 remaining creators** after L2 — ours vs vendor boxes. Owner will type numbers; APIs must persist what he types.
5. **POSTING-CONTRACTS.json** invoice event-2 vs live `unbilled_revenue` — **not** this hour (separate PR after GO-11).
6. **Driver bill `B-`:** leave. Company settlement table: leave.

NO-SEAT prod money. Never `trigger_deploy`. ACK OUTBOX: `CC-1 | ACK | GO-11 | GO`
