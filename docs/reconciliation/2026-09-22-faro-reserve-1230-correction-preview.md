# GL 1230 Factoring Reserves — correction PREVIEW (Cursor, 2026-09-22, Lead round 51 items 1 and 2)

**Status: PREVIEW, revision 2 (owner's original Faro reports). Nothing posted. Posts only after the Lead approves.**

Defect (my seat's): `scripts/ops/cursor-2026-09-22-faro-8-direct-legs.mts:111` (#22193) and
`scripts/ops/cursor-2026-09-22-faro-reserve-close-6-invoices.mts` (both Cursor, 2026-09-22) leave 1230 at
**−$33,055.27** live: DR $2,818.36 (59 funding holdbacks) − CR $35,730.00 (8 intercompany legs) − CR $143.63
(reserve close).

## Sources — the owner's Faro exports in ~/Downloads (repo copies byte-identical where they exist)

- `RESERVE REPORT.csv` — Faro's ledger of **USMCA's** reserve, opening 0, ending $135.41 at 9/21.
- `PAYMENTS TO USMCA FROM FARO.csv` — every Faro payment and deposit, with its "USMCA Tank <date>" wire batch.
- `funds due report 09-21-26.csv` — the 9/21 batch; last line **"($4,000.00) Wire"**, a deduction from USMCA's
  funds due. Its label reads `#NAME?` because Excel mis-parses a label starting with "--" (every reserve line
  on these exports starts "-- RSV Transaction --").
- `ACCOUNT SUMMARY.csv` — Escrow Reserve **$4,530.19**, Cash Reserve **$4,135.41** = **$8,665.60**; Discount Fee
  $4,673.82, Schedule Fee $8.22, Wire Fee $220; Debtor Receipts $12,825.

Tie-out of Faro's reserve: escrow holdbacks on all USMCA purchases $4,673.82 − escrow→cash $143.63 = $4,530.19;
cash = $143.63 − schedule fees $8.22 + the 9/21 deposit $4,000.00 = $4,135.41. The $4,000 **has** a source — the
funds-due deduction above; it is a reserve deposit still held, not an unexplained balance.

## Rule

Doing "re-point all 8" AND "book the deposits" credits USMCA's Faro funds twice (1230 → +$33,650.14, four times Faro's figure). For
any one leg, "keep the transfer and add its deposit" and "re-point the transfer" end at the same balances
(DR 8000 / CR 1090, 1230 net zero). **1230 mirrors Faro's USMCA reserve ledger**: a leg Faro ran through
USMCA's reserve keeps its credit and gets its missing deposit; a leg Faro never ran through it is re-pointed.
Counter-account **1090 Undeposited Funds**: a reserve deposit is taken out of the day's funds due to USMCA
(proven by the 9/21 funds-due deduction), and our funding entries carry funds due from Faro in 1090.

## A — book the 5 reserve deposits (new entries): DR 1230 / CR 1090 — $30,840.00

| date | $ | Faro note | source row | matching transfer (kept) |
|---|---|---|---|---|
| 2026-08-28 | 5,000.00 | Rsv Deposit — pago ccg | PAYMENTS, USMCA Tank 08/28/2026 | 9/2 JE `0f867254-bff0-4cb1-99b9-cb1b396083ee` |
| 2026-09-08 | 11,840.00 | Rsv Deposit — Dinero en HOLD por facturas de Larralde | PAYMENTS, USMCA Tank 09/08/2026 | 9/9 JE `319a1897-5a04-4e25-8b16-bea5ea3538d3` |
| 2026-09-14 | 8,000.00 | Rsv Deposit — Ajuste reserva negativa ih35 | PAYMENTS, USMCA Tank 09/14/2026 | 9/15 JE `ea80a374-1f15-4aa2-ab59-fd166177fa25` |
| 2026-09-17 | 2,000.00 | Rsv Deposit — Deposit to negative reserve IH35 | PAYMENTS, USMCA Tank 09/17/2026 | 9/21 JE `55aee712-32dd-49dc-93ee-3fbfc1182f0e` |
| 2026-09-21 | 4,000.00 | deduction from the 9/21 funds due (still held) | funds due report 09-21-26, last line | none — still in the reserve |

## B — re-point the 4 legs that never touched USMCA's reserve: reverse, then re-post DR 8000 / CR 1090 — $8,890.00

None is on USMCA's reserve report. In PAYMENTS each is that invoice's advance paid by "Faro Internal Transfer" to
IH35's reserve instead of wired to USMCA.

| date | $ | invoice (Faro) | JE to reverse |
|---|---|---|---|
| 2026-08-12 | 1,649.00 | Watco Supply Chain, inv 4 (face $1,700 × 97% = $1,649; debtor paid Faro $1,700 on 9/15) | `12c6d447-7d9f-46e9-b973-bf14e4d3d6a6` |
| 2026-08-13 | 1,800.00 | Magna Transport Solutions, inv 5 | `f47e4e9f-1455-498d-9c64-73c2aed8572e` |
| 2026-08-14 | 688.00 | CTS Xpress, inv 12 | `0e529e4f-f284-48c1-9eae-d8b62fc88579` |
| 2026-08-14 | 4,753.00 | S E Mares Forwarding, inv 13 | `7a93859f-b4c1-4ddc-9b42-f3cb4ac4f76e` |

Watco appears twice in PAYMENTS on 8/12 (a Payment and a Deposit of $1,649, both "Internal Transfer to IH35
Reserves"). USMCA's reserve report, opening at 0, has no 8/12 movement, so the deposit side is IH35's reserve,
not USMCA's — same case as the other three.

## D — reserve close, JE `ad7b68b5-0f77-41f8-bc53-ff1c63f941a5`: reverse, then re-post DR 6400 / CR 1230 — $8.22

Posted as DR 1090 $135.41 + DR 6400 $8.22 / CR 1230 $143.63. The $143.63 moved escrow → cash **inside** USMCA's
reserve; $135.41 is still held at Faro. Only the $8.22 of schedule fees left the reserve.

## Expected result (stated before posting)

| account | now | after A + B + D | change |
|---|---|---|---|
| 1230 Factoring Reserves | −33,055.27 | **+6,810.14** | +39,865.41 |
| 1090 Undeposited Funds | 89,791.33 | 49,925.92 | −39,865.41 |
| 8000 Inter-company – IH35 Transportation | 35,730.00 | 35,730.00 | 0 |
| 6400 Factoring Fees | 2,826.58 | 2,826.58 | 0 |

**Residual against Faro's $8,665.60: $1,855.46 — exactly the escrow holdbacks on Faro purchases not yet posted
as advances** (Faro $4,673.82 − ours $2,818.36). CC-2's 10 'submitted' advances carry $709.95 of it; $1,145.51
sits on Faro purchases with no advance record. When every Faro purchase is posted, 1230 = $8,665.60 to the cent.

Not in this correction (named, not hidden): Faro wire fees $220 are not in 6400; the $12,825 of debtor receipts
(7 invoices: 3, 4, 7, 8, 11, 14, 16) are the design's R2 collection legs that have never posted (2150 has zero
debit lines); CORE 14 was short-paid $250.

## How it posts (existing engines, one transaction, dry-run by default)

- Reversals: `reverseJournalEntryNoFlip` (`apps/backend/src/accounting/journal-entries.service.ts:447`) —
  linked equal-and-opposite entry, original stays posted, `reversed_by_je_id` set. Nothing deleted.
- New entries: `createJournalEntryOnClient` (`:145`) — enforces balance and open period (Aug and Sep 2026 open;
  no period is closed).
- Provenance: that engine writes lines as `manual_je` with NULL source — the generator behind the 440 unsourced
  lines. In the same transaction (its `afterInsertBeforeCommit` hook) each new line gets `source_transaction_type`
  = `faro_reserve_deposit` (A), `faro_intercompany_leg` (B), `faro_reserve_fee` (D) and `source_transaction_id` =
  the entry's own id — the convention the original legs used.
- Every memo cites its Faro report row. After apply: the four balances above re-measured with five-column
  liveness and pasted.
