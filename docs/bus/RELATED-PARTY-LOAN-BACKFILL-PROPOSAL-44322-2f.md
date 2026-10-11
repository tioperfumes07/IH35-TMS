# ROUND 443.22-2f — Related-party loan backfill proposal (READ-ONLY)

**Status:** PROPOSAL ONLY — no journal entry rewritten, no facility row written.  
**Owner order:** `docs/bus/2026-10-10-LEAD-ROUND-443-ORDERS.md` STEP 2f.  
**Measured:** Neon `br-fancy-credit-akjnd07a`, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`, `app.bypass_rls=lucia`.  
**Machine appendix:** `docs/bus/RELATED-PARTY-LOAN-BACKFILL-PROPOSAL-44322-2f.json` (regenerate with `scripts/ops/r44322-2f-measure-rpl-postings.mjs`).

## Law for this round

1. The **209** existing posted lines on related-party loan accounts stay exactly as they are.
2. Bank categorizations of 10-06 to 10-09 stay exactly as they are.
3. Backfill runs **only on the owner's word**, through the same RPL engine (facility advance / repayment + note), **never** by editing a journal entry.
4. Parent account **2410** is never the facility home — person sub-accounts only.

## Count check (packet vs live)

| Scope | Count |
|---|---:|
| Lead packet total postings | 209 |
| Measured posted lines on 2410* / 1270 / 1295 | **209** |
| Of which already reversed (leave alone) | **182** — all on parent `2410` |
| Live non-reversed candidates | **27** — person sub-accounts only |
| Facilities / entries / schedule today | **0 / 0 / 0** |

Parent `2410 Owner / Related-Party Loan Payable` net live balance is **$0.00** because every one of its 182 lines is part of a reversal pair. Do **not** backfill those 182.

`1270 Loans to Related Parties` and `1295 Relay Fuel Wallet` have **0** postings today.

## Account roll-up (live, non-reversed)

| Account | Person | Live lines | Debits | Credits | Net credit (liability) |
|---|---|---:|---:|---:|---:|
| 2410 | parent | 0 live (182 reversed) | $0 | $0 | $0.00 |
| 2410-00-001 | Jorge Pablo Guadalupe Muñoz Gonzalez | 14 | $12,435.00 | $7,905.00 | **-$4,530.00** |
| 2410-00-002 | Scentsx | 9 | $2,000.00 | $13,450.00 | **+$11,450.00** |
| 2410-00-003 | Tio Perfumes 2 | 4 | $3,800.00 | $770.00 | **-$3,030.00** |
| 2410-00-004 | Laura Muñoz | 0 | $0 | $0 | $0.00 |

## How each live line would become a facility entry

Convention for liability sub-accounts:

- **Credit** on 2410-00-xxx → money **IN** → `facility_advance` on that person's facility (company owes more).
- **Debit** on 2410-00-xxx → money **OUT** → `facility_repayment` on that person's facility (company paid down).

No JE is rewritten. Engine create would mint the facility document + advance note and **link** to the existing bank categorization / JE (pointer only). Rate for historical advances defaults to **4.00%** unless the owner rules otherwise before backfill.


### Jorge Pablo Guadalupe Muñoz Gonzalez (14 live lines)

Proposed facility open if backfilled 1:1 from live GL: advanced $7905.00 − repaid $12435.00 = open $-4530.00

| Date | Dir | Amount | Kind | Bank / source | Posting id |
|---|---|---:|---|---|---|
| 2026-01-30 | IN | $400.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# yuls47hea; MUNOZ, JORGE | `d470e43f` |
| 2026-03-31 | IN | $2100.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# y64hn1g65; MUNOZ, JORGE | `b755b70a` |
| 2026-04-30 | IN | $100.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# scqttup62; MUNOZ, JORGE | `b36577d7` |
| 2026-05-06 | IN | $500.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# u9fu1b4ng; MUNOZ, JORGE | `7bbd393e` |
| 2026-05-13 | IN | $600.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# whsq20aw3; MUNOZ, JORGE | `bd9ced99` |
| 2026-06-02 | IN | $450.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# vak3t40fb; MUNOZ, JORGE | `4a8ff804` |
| 2026-06-08 | IN | $755.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# sn49yjx9w; MUNOZ, JORGE | `0c584980` |
| 2026-07-10 | OUT | $85.00 | facility_repayment | Mobile transfer to CHK 4098 Confirmation# ys054lx4s; Munoz | `107be1a9` |
| 2026-08-21 | IN | $3000.00 | facility_advance | Mobile transfer from CHK 4098 Confirmation# sqdk7u81d; MUNOZ, JORGE | `31910541` |
| 2026-09-24 | OUT | $600.00 | facility_repayment | Mobile transfer to CHK 4098 Confirmation# v2evn4x8q; Munoz | `4a26e012` |
| 2026-09-24 | OUT | $700.00 | facility_repayment | Mobile transfer to CHK 4098 Confirmation# vk30c7kvr; Munoz | `4d9d284d` |
| 2026-09-24 | OUT | $400.00 | facility_repayment | Online transfer to CHK 4098 Confirmation# swa25il01; Munoz | `a547234a` |
| 2026-10-02 | OUT | $5200.00 | facility_repayment | Online transfer to CHK 4098 Confirmation# u4vb1ticf; Munoz | `4826907b` |
| 2026-10-05 | OUT | $5450.00 | facility_repayment | Mobile transfer to CHK 4098 Confirmation# z8f9mq3v0; Munoz | `78a9bf6f` |

### Scentsx (9 live lines)

Proposed facility open if backfilled 1:1 from live GL: advanced $13450.00 − repaid $2000.00 = open $11450.00

| Date | Dir | Amount | Kind | Bank / source | Posting id |
|---|---|---:|---|---|---|
| 2026-04-14 | IN | $300.00 | facility_advance | Online transfer from CHK 2080 Confirmation# d3veahbj0; SCENTSX LLC | `30c7fd7f` |
| 2026-05-26 | IN | $300.00 | facility_advance | Mobile transfer from CHK 2080 Confirmation# c7fopz1cn; SCENTSX LLC | `1622748c` |
| 2026-05-28 | IN | $400.00 | facility_advance | Mobile transfer from CHK 2080 Confirmation# fjifp8seo; SCENTSX LLC | `f1c5b1ef` |
| 2026-06-24 | IN | $5000.00 | facility_advance | Mobile transfer from CHK 2080 Confirmation# fd9mlt6jy; SCENTSX LLC | `34d4e355` |
| 2026-07-21 | IN | $2000.00 | facility_advance | Mobile transfer from CHK 2080 Confirmation# ahx5rnbih; SCENTSX LLC | `0ff6e74f` |
| 2026-07-22 | OUT | $2000.00 | facility_repayment | Returned: Mobile transfer from CHK 2080 Confirmation# ahx5rnbih; SCENTSX LLC | `81233bf1` |
| 2026-07-27 | IN | $50.00 | facility_advance | Mobile transfer from CHK 2080 Confirmation# hg2u5vias; SCENTSX LLC | `a9707579` |
| 2026-07-28 | IN | $4900.00 | facility_advance | Online transfer from CHK 2080 Confirmation# l4yfuhrhr; SCENTSX LLC | `674a9841` |
| 2026-09-23 | IN | $500.00 | facility_advance | Online transfer from CHK 2080 Confirmation# chjhr3hco; SCENTSX LLC | `da17f2ba` |

### Tio Perfumes 2 (4 live lines)

Proposed facility open if backfilled 1:1 from live GL: advanced $770.00 − repaid $3800.00 = open $-3030.00

| Date | Dir | Amount | Kind | Bank / source | Posting id |
|---|---|---:|---|---|---|
| 2026-09-10 | OUT | $2600.00 | facility_repayment | Zelle payment to TIO PERFUMES 2 LLC Conf# vmg4i21ea | `09a63025` |
| 2026-09-10 | OUT | $800.00 | facility_repayment | Zelle payment to TIO PERFUMES 2 LLC Conf# ufkxhk986 | `3bc8d883` |
| 2026-10-05 | OUT | $400.00 | facility_repayment | Zelle payment to TIO PERFUMES 2 LLC for "Prestamo"; Conf# zd51fah25 | `ddbbb081` |
| 2026-10-05 | IN | $770.00 | facility_advance | Zelle payment from TIO PERFUMES 2 LLC Conf# qbskjcz62 | `f0c7393f` |

### Laura Muñoz (0 live lines)

Proposed facility open if backfilled 1:1 from live GL: advanced $0.00 − repaid $0.00 = open $0.00

| Date | Dir | Amount | Kind | Bank / source | Posting id |
|---|---|---:|---|---|---|

## Debit-balance sub-accounts explained (line by line)

A liability with a **debit** balance means the company has paid that person **more** than the ledger shows they lent. That is not a sign flip error in the measure — it is what the bank categorizations did.

### Jorge (2410-00-001) — net debit $4,530.00

Advances (credits) total $7,905.00 across 8 IN lines (2026-01-30 … 2026-08-21).  
Repayments (debits) total $12,435.00 across 6 OUT lines (2026-07-10 … 2026-10-05), including large 10-02 $5,200 and 10-05 $5,450 transfers back to Jorge's CHK 4098.

**If backfilled 1:1**, the Jorge facility would show open balance **-$4,530.00** (company overpaid vs recorded advances). Owner must rule before backfill whether:

1. Accept the negative open (true overpay / loan *to* Jorge on `1270` for the excess), or
2. Missing IN advances exist off-ledger and should be entered first via the engine, or
3. Some OUT lines are not loan repayments (reclassify purpose — still not by editing JE history in this round).

### Tio Perfumes 2 (2410-00-003) — net debit $3,030.00

Three OUT Zelle payments ($2,600 + $800 + $400 = $3,800) and one IN Zelle $770. Same shape as Jorge: more paid out than recorded as lent. Same three owner choices apply.

### Scentsx (2410-00-002) — net credit $11,450.00

Normal loan payable shape. One returned $2,000 (07-22) correctly nets the 07-21 $2,000 IN. Facility open would be **$11,450.00** if backfilled 1:1.

### Laura Muñoz (2410-00-004)

Zero postings. Facility can be created empty when the first bank IN / paid-direct advance lands going forward — no backfill rows.

## What this round does **not** do

- Does not INSERT into `related_party_loan_entries` / `facilities` / `schedule`.
- Does not UPDATE or reverse any of the 209 JE lines.
- Does not change bank categorizations of 10-06 … 10-09.
- Does not invent missing advances to make Jorge / Tio balances non-negative.

## Owner decision needed

Reply on the bus with one of:

1. **Backfill the 27 live lines as proposed** (Scentsx + Jorge + Tio 1:1; accept negative opens or convert excess OUT to `1270` in a later owner-approved step).
2. **Backfill Scentsx only** (clean credit balance); hold Jorge / Tio until the debit balances are ruled.
3. **Hold all backfill** — going-forward engine only (2a–2e already shipped).

Backfill, when authorized, runs through `POST /api/v1/accounting/related-party-loans` (and repay path) with `bank_transaction_id` / JE linkage — same engine as 2a–2e — never by hand-editing `journal_entry_postings`.

## Proof this file is current

- `packet_count_check.measured_all_posted = 209`
- `packet_count_check.measured_live_non_reversed = 27`
- `packet_count_check.measured_reversed_pairs = 182`
- Regenerate: `DATABASE_URL=… node scripts/ops/r44322-2f-measure-rpl-postings.mjs docs/bus/RELATED-PARTY-LOAN-BACKFILL-PROPOSAL-44322-2f.json`
