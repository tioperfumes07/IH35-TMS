# PASTE ALL SEATS — GO-01…08 + QBO NUMBER BOX (2026-09-01)

Owner law: execute first time; question once. USMCA only. U14 never recertify. NO-SEAT prod financial fixtures. Never `trigger_deploy` unless Cursor lead 5–10 PR / 5–10 min gate. FAST-MERGE ~4 min.

**Visible document number (QuickBooks create chrome — owner 2026-09-01):**
- Every creator has a **clickable empty No. box** (Load, Invoice, Bill, Expense, Bill payment / Check, Receive payment, Credit memo, Vendor credit, Driver bill, Settlement, Cash advance, Transfer/Deposit).
- Operator **may leave it empty**. Empty on save → **server mints** with existing series logic (do not invent a new counter).
- Operator **types** → persist **verbatim** (no pad, no prefix, no uppercase). Last typed value is what **next suggestion** follows when we show a hint — **do not force-fill the box**. Prefill is a hint only; default UX is **empty**.
- Duplicate → **HTTP 409**, never 500, never silent overwrite. Uniqueness is already live (partial unique **indexes** — query `pg_index.indisunique`, not `pg_constraint`).
- FKs and GL always use **uuid PK**. After visible numbers are editable, **GO-08 `trace_key`** is the phone/search handle.

**Expense uniqueness (asked once):** leave **company-wide** (option b). Per-vendor only if Jorge replies (a).

---

## PASTE → CC-1 (money / schema)

```
SEAT=CC-1 | ACK | POST-U14 | NOW=GO-01 then GO-08 then GO-02 API
git pull --ff-only origin main

P0 GO-01 INSURANCE DATA (blocks GO-02/03)
File: Downloads/GO-01-INSURANCE-DATA-ACV-TRAILERS-DRIVERS.txt
- Copy ALL 35 ACV from signed Lloyd's table in docs/bus/GO-INSURANCE-FULL-WIRING-FIX-2026-09-01.md — DO NOT INVENT ACV
- 20 trailer mdata.assets from USMCA-APD-16..35 equipment
- Attach missing tractor T163 to policy 437539
- Seat 13 drivers on insurance.driver_schedule
- Done-gate ONE query: 437539 TIV = $1,077,940.00 EXACTLY not approx
- Do not recreate policies CIMD-2026-0720 / 437539 / 437540
- NO-SEAT: no AR/AP/JE fixtures

THEN GO-08 TRACE (P1, before load volume)
File: Downloads/GO-08-DUAL-NUMBERING-VISIBLE-AND-INTERNAL-TRACE.txt
- Do NOT invent a third PK. uuid stays identity.
- Add trace_no + generated trace_key per doc type (LD-/IN-/BL-/EX-/PM-/…)
- Real sequence per (opco, type). NEVER MAX()+1. Trigger blocks UPDATE of trace_no.
- Invisible on printed forms; footer + audit + export + search + journal_entry_postings
- Backfill created_at, id order
- Expense unique stays COMPANY-WIDE unless owner says (a)

THEN GO-02 API: coverage-gaps per INSURANCE_COVERAGE_TYPES array; trailer Auto Liability = not_required not MISSING
THEN GO-05: column prefs off localStorage → per-user table

Never trigger_deploy. FAST-MERGE. GO.
```

---

## PASTE → CURSOR (screens + janitor + lead)

```
SEAT=CURSOR | ACK | POST-U14 | NOW=GO-06 UI empty-box + GO-07 KPI drill + GO-04 leftover
git pull --ff-only origin main

P0 GO-06 VISIBLE NUMBERS (owner blocked on booking loads)
File: Downloads/GO-06-MANUAL-TRANSACTION-NUMBERS-QUICKBOOKS-PARITY.txt
QBO chrome THIS TURN (owner): box starts EMPTY. Click to type. Save with blank → API mints. Save with typed → verbatim.
ONE shared component (QboDocumentNumberField) on all 12 create/edit headers. Not 12 one-offs.
Accept optional load_number / display_id / bill_number / expense_number / check_number / reference_number / payment display_id on CREATE and EDIT.
GET next-number returns { suggested, derived_from } from LAST SAVED visible number +1 — for caption/hint only, do not auto-fill unless operator asks.
409 duplicate_document_number { field, value, message }. Lock visible number after posted/factored/paid (void-and-reissue).
Linkage: from-load invoice defaults to load visible number, still overridable. Expenses on load 13560-01 / 13560-02 existing seq.
NO-SEAT: do not book 13560 in prod yourself. Owner keys loads.

P1 GO-07 KPI DRILL
Files: Downloads/GO-07-KPI-DRILLTHROUGH-COLUMNS-DISPATCH-AND-MAINTENANCE.txt + KPI-DRILLTHROUGH-DESIGN.html
Three shapes only: UNITS / LOADS / TRANSACTIONS. ParityTable. tile.value === drill.rowCount.
Kill any atRiskCount+lateCount double-count. Detention belongs on dispatch KPI row.
Maintenance: heading + caption = work orders not units (GO-04).

P1 GO-02 UI after CC-1 array API. GO-03 blocked on GO-01 TIV green.
P1 GO-05: convert named raw <table> waves with CC-3/Codex; do not flatten financial statements.

Lead: FAST-MERGE bus. Deploy 5–10 PR / 5–10 min one in-flight. Hard-refresh before judging FE.
U14 never restamp. GO.
```

---

## PASTE → CC-3 (FE / mechanical)

```
SEAT=CC-3 | ACK | POST-U14 | NOW=GO-05 WAVE 1
git pull --ff-only origin main

GO-05: Downloads/GO-05-CONVERT-46-RAW-TABLES-TO-PARITYTABLE.txt
Wave 1 = first 10 daily operator screens (not the 6 table-infra files).
ParityTable only. Recommend consolidating competing table components BEFORE deleting any.
Financial statements: STOP if ParityTable cannot do subtotal rows — report, do not flatten Balance Sheet.
Do not steal GO-01/GO-06 money. Never trigger_deploy. FAST-MERGE. GO.
```

---

## PASTE → CODEX

```
SEAT=CODEX | ACK | POST-U14 | NOW=GO-05 WAVE 2 + GO-07 dispatch services if Cursor needs them
git pull --ff-only origin main

GO-05 wave 2 (files 11–18). Financial-statement STOP-RULE: if ParityTable cannot express a subtotal row, OUTBOX it — do not flatten.
GO-07: dispatch alert services date-range re-query (not now()-only snapshots) when you touch those files.
No Chrome CDP. No U14 restamp. Never trigger_deploy. GO.
```

---

## PASTE → CC-2 (verify live, never build)

```
SEAT=CC-2 | ACK | POST-U14 | NOW=VERIFY
git pull --ff-only origin main

1. After CC-1 GO-01 merge: TIV query for 437539 = $1,077,940.00 EXACTLY. Paste SQL + result.
2. GO-08: enumerate all 72 ON CONFLICT DO UPDATE in apps/backend/src. Table, conflict target, owner-data risk. Any document-create upsert → must be DO NOTHING + 409.
3. Uniqueness audit: pg_index WHERE indisunique — never pg_constraint contype=u (false empty).
Never build. Never trigger_deploy. GO.
```

---

## PASTE → CASCADE

```
SEAT=CASCADE | ACK | POST-U14 | NOW=UNIQUE FINDING ONLY
Do not recertify U14. Do not steal GO-01/06. Unique FINDING leftover 500 / dead click / silent no-op. GO.
```

---

## PASTE → DEVIN-A

```
SEAT=DEVIN-A | ACK | POST-U14 | NOW=LIVE CHROME
Hard-refresh. healthz/shallow version vs FE bundle — if API lags FE, wait for Cursor deploy gate; do not hammer 404s.
Click Book Load number box: empty, typeable. Maintenance KPI heading/captions. Insurance after GO-01.
Clicked on 9227. No fixtures. GO.
```
