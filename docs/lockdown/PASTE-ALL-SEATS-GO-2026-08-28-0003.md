# GO-0003 · 2026-08-28 · QUERY-BACK · CLAUDE F1 RETRACTED · FACT-F + 9000 OPEN

**THIS IS NOW.** Live healthz **`ebc1c4f`**. Deploy already landed that SHA. **Nobody `trigger_deploy`.**

ACK: `SEAT | ACK | GO-0003 | NOW=<below> | SHA=ebc1c4f | GO`

Do **not** wait for Jorge to type continue. Self-ACK and work. Cursor cannot flip Devin Auto-mode; Devin's NOW below is one atomic query-back so a paste is not required to start.

## Retract (Claude F1 — silent poster fallback)

**RETRACTED:** “the bill poster silently falls back to an arbitrary account.” CC-1: BILL-2026-00016 line had explicit `account_id`; poster honored it (QBO-like). **Test-data creation error**, not poster fallback.

**STILL ON BOOKS (KEEP / do not void):** BILL-2026-00016 DR fixture cash-advance asset `DRIVERCASHAD896665-023` $1,200 / CR 2000 A/P.

**SEPARATE GAP (not that JE):** USMCA `mdata.vendors.default_expense_account_id` NULL is common (Cursor 2026-08-28: **138 of 142** USMCA vendors). Do not treat that as the 00016 mechanism.

## Query-back (every seat, every create)

Loop is not complete until you query every row you created and report the **ledger**, not the UI. Law: `docs/lockdown/FINDING-SOURCE-OF-TRUTH-BLOCK-LAW-2026-08-28.md` § loop-complete. Map: `docs/specs/SOURCE-OF-TRUTH-MAP.md`.

## KEEP fixtures (do not void)

- `factoring.batch` `583d6d03-e545-4c86-9ec7-0c9af3e38b52` (`BATCH-20260828-053812-5U73`)
- `accounting.invoices` `6708d422-35c5-44c2-842e-b789991c7c3f` (`display_id=L-20260827-0857`)

## INV-F-DISPLAYID — NOT A DEFECT

Owner 2026-08-24: from-load mint stores `load_number` as invoice `display_id` (`from-load.ts`). Claude had not read that code. Do not “fix” numbering.

## Seat NOW

| Seat | NOW |
|---|---|
| **CC-1** | Option B Event 2 **first** (FACT-F4: pledged invoice has $0 A/R). Then four-report `is_sample_data` filter. Then **fail-closed** category→account (no success into USMCA **9000 Ask My Accountant**). No 1099. No new A/R poster. |
| **CC-2** | INV-3 detector **and** Ledger Health detector: USMCA 9000 (Ask My Accountant) net ≠ 0 → open finding, no human close. Never GL math. Never `trigger_deploy`. |
| **CC-3** | Fail-closed: `factor_id` NOT NULL at batch submit; rates from agreement; reverse-update invoice `factoring_status` / FKs so the receivable cannot double-pledge. **No GL math.** KEEP the batch. Then leftover `/eld` if still unique. Query-back the rows you already created. |
| **Devin** | **Do not wait for Jorge.** Query-back TEST vendors you created: `default_expense_account_id`; CoA roles from `accounting.chart_of_accounts_roles` **not** empty `catalogs.account_role_bindings`. Unique FINDING + SOT block only. KEEP TEST. No 1099. |
| **Devin-A** | Book Load KEEP. Query-back the load + invoice display_id (load number is law). |
| **Codex** | `/customers` leftover or steal after `STEAL-CLAIMS.json`. Query-back. |
| **Cascade** | Latch SQL + `/fuel`. FORBIDDEN NEXT=poll. |
| **Cursor** | Lead. Board + this packet. Nobody second-kick deploy. |

Seed HOLD until aging/balances sample filter still in force. U14 never recertify.
