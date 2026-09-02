# INBOX-CC-1 · FORCE · 2026-09-01 23:05 CT · GO-19 MONEY SERIAL · NO LOADS

`git pull --ff-only origin main` · live API **29072a4**

**HARD (locked — do not re-ask):**
- Jorge books loads and all real testing. Seats **NEVER POST Book Load** · **NEVER create loads** · **NEVER sample/demo fixtures** · **NEVER seat prod money rows** (`docs/lockdown/NO-SEAT-PROD-FINANCIAL-FIXTURES-LAW-2026-09-01.md`).
- Bank categorize Jul 2025–Jul 2026 = **Jorge only**. Seats **never invent GL**.
- Escrow from-0 = **your forensic/WORM plan** — **never Ask Jorge if Neon restored**.
- Capitalize $7500 · insurance samples **CLOSED**. USMCA only. U14 **CERTIFIED — never recertify**.
- One open money PR at a time (Rule 27). **Never `trigger_deploy`**.

**Paste:** `docs/bus/PASTE-ALL-SEATS-STOP-NO-SEAT-LOADS-2026-09-01.md` · `docs/lockdown/GO-19-BUILD-QUEUE.md` · GO-18 `docs/lockdown/GO-18-LOAD-COSTS-DESIGN.md`

## VOID this shift
- Creating loads, TEST/SAMPLE rows, throwaway books, new `is_sample_data=true` bank writes.
- Asking Jorge Neon restore. Inventing bank GL / categorize rules. Zero escrow. Live Book Load POST.

## NOW (serial — finish one PR before opening the next)

1. **FORCE — Escrow closeout vs owner from-0.** Forensic tie-out on existing rows only. WORM void/reversal discipline. **No zero.** **No Ask Jorge restore** — agents apply Neon themselves.
2. **GO-19-02 FORCE — `banking.bank_transactions.is_sample_data`.** Migration + mark the **existing ~34** USMCA fixture rows. Filter reads default `false`. **NEVER DELETE.** **Never invent new bank rows.**
3. **GO-19-03 FORCE — drop `B-` on driver bills.** Grep `driver-bill-number.ts` + `expense-number.ts` on `origin/main` first (seq1 bare load # may already be merged). Ship code + guard if still `B-`.
4. **GO-18/GO-19 slices 05+06 FORCE — bills FK + bill_lines.load_required.** One migration author: `accounting.bills` driver/trailer/recover columns + `accounting.bill_lines.load_required` / exemption mirror expense_lines. Code + guard. **No live book to prove.**

## NEXT (after 05/06 merge — do not parallel)
- GO-19-04 proforma-at-pickup = **Cursor** lane (not you).
- GO-19-08 future bank dates + Cascade 407 uncategorized = **after 02**; still **never invent GL**.

## Evidence (every PR)
Claude-green FINDING block · one PR · local gate PASS · merge on green · Neon apply yourself · OUTBOX one line.

ACK `CC-1 | ACK | FORCE | NOW=escrow forensic no Ask Jorge THEN GO-19-02 mark/hide ~34 bank fixtures NEVER DELETE THEN 03 drop B- THEN 05/06 bills FK+bill_lines.load_required · serial one PR · NEVER POST Book Load · NEVER seat fixtures · NEVER invent GL | GO`
