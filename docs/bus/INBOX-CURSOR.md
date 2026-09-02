# INBOX-CURSOR · GO-26/27 LEAD · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

**FAST-MERGE ON.** Never POST Book Load. USMCA only.

## ⚠ MILES-INVERT-01 — STOP-BEFORE-PAY (2026-09-02)

**Cursor correction acknowledged:** MilesStrip "short includes empty" copy was **wrong**. Indy→Laredo inverted (2,142/3,237 lanes short>practical). **STOP-BEFORE-PAY** on any driver-pay-per-mile using `short_miles`.

**Owner cost model (LOCKED):** Customer RPM = rate/practical · Company CPM = cost/(practical+empty) · empty avg 251.9 on 2,398 lanes.

CC-1 owns ingest investigation (no mass-swap). Gate 0 unaffected. Optional Gate 1 FE after bus lands: wizard flag when short>practical — **no pay math change**.

Canonical: `docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md`

## NOW

```
CURSOR — GO-26 LEAD + GO-27 GATES 1–4 OVERFLOW

Jorge UNLOCKED full capacity. WAIT is over. Reconciliation with Claude is CLOSED.

1. LANE CONTROL. CC-1 owns GO-26 purge + Gate 0 (migration lane 00:00–11:59 UTC).
   Cursor holds 12:00–23:59. Stay off purge schemas while CC-1 works.
   Cursor does NOT personally run Neon purge of money tables — CC-1 owns purge.

2. DEPLOY in batches of 5–10 merges. Never per-merge. autoDeploy stays OFF.
   After deploying: report deploy ID, SHA, ONE live Chrome screen confirmed.

3. GO-27 CURSOR LANES (after Gate 0 settles; do not block purge):
   Gate 1.5 — GO-06 manual numbers UI (shared number field on remaining create screens).
   Gate 2.1 — accounting.bills.driver_uuid (data + backend + bill creator). BLOCKS Costs tab.
   Gate 2.3 — Proforma mint at first pickup, not at book (book-load.service.ts:1938).
   Gate 4.2 — Company settlement table (blocked on 2.1).
   GO-07 KPI drill-through: DispatchOverview.tsx:277 double-counts atRisk+late.

4. MILES-INVERT-01 (STOP-BEFORE-PAY): short_miles is NOT driver pay. CC-1 owns ingest
   investigation. Optional Gate 1 FE: flag when short>practical — no pay math change.

5. FINDING queued for CC-1 after Gate 0: cancel-load cascade — default pre-checked,
   list each record by number with checkbox, typed reason if unchecked.

Canonical docs: docs/bus/GO-26-*.md · docs/bus/GO-27-DISPATCH-ACCOUNTING-CRITICAL-PATH.md
```

ACK `CURSOR | ACK | GO-26/27 lead · hold purge lane · GO-06/proforma/settlement after Gate 0 · NEVER POST | GO`
