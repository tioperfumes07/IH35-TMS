# CC-1 — FINAL: all pending work, until SEAT DONE (owner 10-24 8:54 PM CT)

Law: `~/Downloads/10-24-2026-ALL-CODERS-FINAL-RUN-LAW.md` (read once). Rows: `~/Downloads/10-24-2026-CC1-PENDING-ROWS-FINAL.md` — 54 rows. Do every row.

## Order
1. **443.346 (gap-account engine).** It is in the Lead's merge queue now; do not touch `/private/tmp/wt-cc1-443346`.
   - Next, write `scripts/ops/2026-10-24-cc1-443346-faro-gap-repost.mts` with a `--dry-run` default and a `verify-owner-authorization` call.
   - Per advance (FAC-00012/18/20/25) it shows: FAC id, bank line id plus amount, Faro wire, and gap target.
   - Gap target is 8000 when the gap is a Faro→IH35 reserve transfer, per `docs/reconciliation/2026-09-22-faro-reserve-1230-correction-preview.md`; otherwise 1230.
   - FAC-00025's $23,182.70 must be traced to a source document. If none exists, mark it `UNEXPLAINED` and do not post it.
   - It shows the before/after BofA tie-out. Put the dry-run output in the PR body. The Lead applies it.
2. **Account 2170 (443.322 ENG-04).**
   - **Code:** the advance posting resolver can never resolve `driver_payroll_clearing` (2170) for an advance. It resolves from the advance's method:
     - wire / ACH → the bank account (from_bank_account_id is required; refuse null);
     - EFS check → EFS payable (vendor);
     - efectivo / cash → the cash account role.
     Add a guard.
   - **Ops script (dry-run):** for the 12 advances CA-2026-0001..0012 ($2,575.96), find each one's real payment evidence (bank line or EFS transaction) read-only. Propose a reclass JE per advance: Dr 2170 / Cr <real source>. Mark any advance with no evidence `NO-EVIDENCE` and leave it.
3. **ENG-35 (row 270).** Re-run the full live engine-guard set and fix every red that is in your lane, root cause each one.
4. **ENG-36 (row 271).** The 23 company settlements that are still negative after ENG-19: measure each, find the cause, fix the engine.
5. Then every remaining row in your rows file, top to bottom: accounting, settlements, factoring, banking-match engine, posting, migrations, guards.

Report to Lead: "CC-1 DONE" + the PR list.
