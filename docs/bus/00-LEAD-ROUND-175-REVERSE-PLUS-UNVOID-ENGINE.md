# CURSOR — ROUND 175 — REVERSE ROUND 172, AND BUILD THE UNVOID (REINSTATE) ENGINE
Issued 2026-09-28, Laredo Central. Lead. Owner-ordered. **Full sequence. Do not stop halfway.**

## WHY THIS BOX EXISTS
You executed `09-28-2026-Cursor-ROUND-172-FARO-ADVANCE-FEED-RULED.md`. Lead had already retracted it
(`docs/bus/00-LEAD-ROUND-172-RETRACTION-ALL-FOUR-ADVANCES-HOLD.md`). Your session started fresh and
read the stale copy. **That hand-off failure is Lead's, not yours.** Fix it and move on.

Owner's ruling: *"you already created a void path and should have created an unvoid path as well…
you need to have cursor build an unvoid engine as well, for all transactions, for traceability."*
He is right. A void with no reinstatement is a one-way door, and a one-way door forces exactly the
kind of destructive workaround that happened here. **JOB 2 is the permanent fix. Do not skip it.**

---

## JOB 1 — THE DAMAGE, MEASURED LIVE

**Two REAL Faro purchases were voided to make room for two unproven ones.**

| FAC | Faro ref | Purchase date | Advance | Invoice total | Status now |
|---|---|---|---|---|---|
| FAC-2026-00097 | `1013272-2` (inv 059) | 2026-09-08 | $5,053.70 | $5,210.00 | **voided** |
| FAC-2026-00125 | `87` (`SEM66538`) | 2026-09-21 | $4,753.00 | $4,900.00 | **voided** |

Both are in `~/Downloads/faro daily purchase report.csv`. Faro really wired that money.
**$9,806.70 of real advanced cash is reversed out of Undeposited Funds.** Faro is the control.

**The replacement is booked against the wrong invoice:**

| FAC | Faro ref | Faro purchase | Attached invoice | Invoice total |
|---|---|---|---|---|
| FAC-2026-00141 | `098` ONPOINT | **$4,400.00** | invoice **13619** | **$5,210.00** |

Faro bought a $4,400 invoice; the advance sits on the **$5,210 Refrigerx** invoice — the one whose own
advance (FAC-2026-00097) was just voided. **$810.00 overstatement.** `invoice_total_cents` = 5210
while the GL posted the liability at 4400 — a header-vs-GL split, same class as 5812.

`voided_at` and `void_reason` are **NULL** on both voided rows — the audit trail was never stamped.
Both load headers were rewritten, so the two voided advances now have **no invoice link at all**.

Trial balance is square at **$2,978,744.96 = $2,978,744.96**. The GL mechanics were clean. The
economics are wrong. A balanced ledger stating wrong facts is the worst case — it looks green.

---

## JOB 2 — BUILD THE UNVOID (REINSTATE) ENGINE. DO THIS **FIRST**, THEN USE IT FOR JOB 3.

**Accounting law — read before you design it.** An unvoid is **NOT** deleting the void and **NOT**
un-setting a flag. QuickBooks, NetSuite and McLeod all treat this the same way and so do we:
a reinstatement is a **third event**, posted forward, that reverses the void reversal. The original
posting stays, the void reversal stays, the reinstatement is added. Three rows in the history, none
destroyed. That is what makes it traceable, and it is the only version a CPA will accept.

Never `DELETE` a posting. Never set `voided_at = NULL`. Never flip status backwards in place without
an event row. The document's lifecycle must read: `created → voided → reinstated`, all visible.

### Scope — ALL financial transaction types, one shared engine, not one-off code
`accounting.factoring_advances`, `accounting.invoices`, `accounting.expenses`,
`accounting.journal_entries`, `accounting.bills` / AP, `driver_finance.driver_bills`,
`driver_finance.settlements`, `banking.*` transactions, and `maintenance.work_orders` where it
carries money. If a type has a void path today, it gets a reinstate path in this PR.

### Required behavior
1. `reinstate(document_id, reason, actor)` — one entry point, one shared service, typed per document.
2. Writes a **reinstatement journal entry** that reverses the void reversal line for line, at the
   original amounts and the original accounts. Not a re-run of the original posting — an explicit
   reversal of the reversal, so the chain is auditable in both directions.
3. Stamps on the document: `reinstated_at`, `reinstated_by_user_id`, `reinstate_reason`,
   and `reinstated_from_void_id` (or the void's journal entry uuid) so the void it undid is named.
   Add the columns in a migration; do not overload `void_reason`.
4. Status returns to its pre-void value, read from the audit trail — **never guessed, never hardcoded**.
5. **Refuses** to reinstate when: the document was voided in a **closed period**; the reinstatement
   would violate a uniqueness rule that something else now occupies (e.g. another advance already
   claims that invoice); the original accounts no longer exist or are inactive; or the document was
   hard-deleted. Each refusal returns a named reason code, never a silent no-op.
6. **Idempotent.** Reinstating twice is a no-op with a clear message, not a double posting.
7. Emits an `audit.row_changes` row and a lifecycle event, same as void does.
8. WORM-safe: goes through the normal posting path so `trg_worm_refuse_delete` is never bypassed.

### Guards (named, in this PR)
- `verify-void-has-reinstate-path.mjs` — every document type with a void path exposes a reinstate
  path. Fails the build when a new void handler ships without its twin. **This is the guard that
  makes the gap impossible to reopen.**
- `verify-reinstate-restores-trial-balance.mjs` — for a sample reinstatement, debits = credits and
  the net effect on every account equals the negative of the void reversal, to the cent.
- Extend `verify-faro-advance-po-matches-load.mjs` (step 11608, yours, and it is correct) to also
  refuse when `factoring_advances.invoice_total_cents` ≠ the linked invoice's `total_cents`.
  **That single check would have caught the $810 before it posted.**

---

## JOB 3 — USE THE NEW ENGINE TO REVERSE ROUND 172
Only after JOB 2 is merged and its guards are green.

1. **Reinstate `FAC-2026-00097`** — Faro `1013272-2`, 2026-09-08, $5,053.70, re-linked to invoice
   13619 ($5,210.00). Reason: `ROUND-175 — voided in error, real Faro purchase`.
2. **Reinstate `FAC-2026-00125`** — Faro `87`, 2026-09-21, $4,753.00, re-linked to invoice 13615
   ($4,900.00). Same reason.
3. **Void `FAC-2026-00141` and `FAC-2026-00142`**, properly stamping `voided_at`,
   `voided_by_user_id`, and `void_reason` = `ROUND-175 — load identity unproven, Lead ruling 172-Updated`.
   Do not leave them null the way the last two were.
4. **Restore both load headers:** 13619 → `customer_wo_number`/`customer_po_number` = `1013272-2`,
   customer = Refrigerx Transportation LLC. 13615 → `SEM66538`, customer = Semares Forwarding Services.
5. **Faro 095, 098, 099, 100, 102 stay on HOLD, unfed.** All five are real purchases and all five get
   fed — after the load each belongs to is proven. Not before. Do not force a header to make one fit.

---

## PROOF REQUIRED — all pasted, all live
- The reinstatement journal entries for 00097 and 00125, line by line, against the void reversals
  they undo.
- The four FAC rows: status, `voided_at`, `void_reason`, `reinstated_at`, `reinstate_reason`,
  invoice link, `invoice_total_cents`.
- Both load headers before and after.
- Undeposited Funds movement for the two reinstatements: **+$5,053.70 and +$4,753.00**.
- Trial balance after, square, with every account that moved named and explained.
- Guard output: all three green, exit 0.

---

## STANDING RULE — SO THIS CANNOT RECUR
Before executing any box: check `docs/bus/` for a later ROUND number on the same scope, and check
whether your box has an `-Updated` sibling in `~/Downloads`. **Highest ROUND number wins. A retraction
outranks the box it retracts.** Any box telling you to void an existing advance or rewrite a load
header is a real-money change — **stop and confirm with Lead first, every time**, whatever the box says.

Work the sequence end to end: JOB 2, then JOB 3, then report. Do not stop between jobs.
