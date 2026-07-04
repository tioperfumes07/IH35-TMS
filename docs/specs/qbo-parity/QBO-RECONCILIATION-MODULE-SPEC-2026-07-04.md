# QBO Reconciliation Module — spec + activation (2026-07-04)

The tool that makes the 3–6 month parallel run real: twice daily it compares TMS's ledger to QuickBooks
and flags **every** divergence for review (no threshold). Read-only. No write-back to QBO.

## Where it lives (§7-correct — NOT a new sidebar item)
The 80px navy left sidebar is locked at 28 modules. The reconciliation UI lives **under Accounting**:
left sidebar → **Accounting** → top sub-nav → **"QuickBooks Reconciliation"** at `/accounting/qbo-reconcile`
(pages already built: `QboReconciliationPage`, `DailyReconPage`, `ReconciliationWorkspacePage`, plus the
FIN-23 captures surface). Runs + Exceptions tabs, ParityTable grammar.

## What is ALREADY built (RECON-01/02 — verified 2026-07-04)
- **Schema:** `accounting.recon_runs` + `accounting.recon_exceptions` (migration `202607022100`).
- **Engine:** `recon-engine.service.ts` — `runBankCountPass` (AM) + `runCategorizationDiffPass` (PM):
  read TMS entries, read the QBO side via a `QboReconSource`, compute exceptions, persist run + exceptions.
- **Cron:** `reconciliation-worker.cron.ts` + `recon-cron.service.ts` — two scheduled passes, 06:00 CT
  (bank count) and 19:00 CT (categorization diff), iterating entities whose per-entity lib-flag
  `TMS_QBO_RECON_ENABLED` is ON. Runs under lucia bypass (system identity).
- **Read API + UI:** `recon.routes.ts`, `qbo-recon.routes.ts`, `qbo-recon-reads.ts` (per-object TMS-vs-QBO
  counts, AR/AP balances, sync state, findings), gated by `TMS_QBO_RECON_UI_ENABLED` / `QBO_RECONCILE_UI_ENABLED`.
- **Safety:** never fabricates a QBO side — an empty QBO side would false-flag every TMS row, so the tick
  records NOTHING for an entity whose QBO source isn't wired.

## The ONE remaining seam (the "build")
`createQboReconSource(operatingCompanyId)` in `recon-cron.service.ts` returns `null` (stub). It is the
deliberate single point that changes when QBO is connected:

```ts
type QboReconSource = { bankEntries(opco, windowStart, windowEnd): Promise<ReconEntry[]> };
```

To wire it: return a source whose `bankEntries()` pulls the entity's QBO register/bank transactions for the
window via the existing QBO client (`integrations/qbo/qbo-client.ts` + `qbo-report-parser.ts`, IMPORT-0) and
maps them to `ReconEntry`. ~1 function, reuses existing infra, behind the OFF flag (build-and-hold).

## Two dependencies to turn it ON (owner actions)
1. **Connect TMS to QuickBooks.** `integrations.qbo_connections` is currently **empty** — TMS has no live
   QBO link, so the source has nothing to pull. Connect each entity's QBO from the **forensic-review page**
   (the same "Re-authorize" the alert emails referenced). This is the same connect flow as the Trucking pull.
2. **Flip `TMS_QBO_RECON_ENABLED` per entity** (lib feature-flag, per-entity override — same mechanism as the
   posting flags). Then the cron picks the entity up on the next 06:00 / 19:00 CT pass.

## Caveat worth stating (QBO in flux)
The original seam comment says wire it "when Martin's 2024 close is stable." Your accountant is still
recategorizing QBO, so the reconciler **will flag a lot** early — but that is exactly its purpose (surface
QBO drift for human review; nothing changes in TMS automatically). Two options:
- **Turn it on now** and treat the early exceptions as the accountant's cleanup worklist, or
- **Wait** until the QBO close stabilizes to reduce noise, then flip.

## Build plan (my next step, on your go)
1. Implement `createQboReconSource()` → real `QboReconSource.bankEntries()` via the QBO client (behind the
   OFF flag; build-and-hold, no self-merge — financial §1.4).
2. Add a CI guard that the source never fabricates a QBO side (empty pull ⇒ skip, not false-flag).
3. You connect TMS↔QBO + flip `TMS_QBO_RECON_ENABLED` per entity → twice-daily flagging goes live at `/accounting/qbo-reconcile`.
