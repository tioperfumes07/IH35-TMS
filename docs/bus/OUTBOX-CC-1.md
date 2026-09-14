# OUTBOX-CC-1

Rotated 2026-09-14 (Rule 1, bus diet law) — prior entries moved to
`docs/bus/archive/OUTBOX-CC-1-2026-09-14.md`. Nothing deleted (WORM).

---

## 2026-09-14 — ROUND 25.1 CONTINUES: S2 (14) + B2 (397) — REPORT ONLY, NOTHING WRITTEN

### S2 — the 14 locked settlements where gross_pay ≠ sum(bills)

35 locked settlements total split exactly: 21 have zero bills linked (separate,
already-named stat, not re-touched here) + 14 have *some* bills linked but the
sum still disagrees with gross_pay. Per row: source_document_ref, header
gross_pay, sum(bills), delta, and net_pay vs the signed AlwaysTrack `total_due`.

| doc  | gross_pay | net_pay | sum(bills) | gross−bills | net vs signed truth |
|------|-----------|---------|------------|-------------|----------------------|
| 5769 | 1155.52 | 1095.52 | 633.46 | 522.06 | MATCH |
| 5778 | 1490.01 | 1245.26 | 853.61 | 636.40 | MATCH |
| 5779 | 1447.66 | 1397.66 | 958.69 | 488.97 | **WRONG — see below** |
| 5788 | 1725.89 | 1273.90 | 1172.90 | 552.99 | MATCH |
| 5790 | 1512.75 | 1452.75 | 761.70 | 751.05 | MATCH |
| 5793 | 1536.65 | 1568.91 | 1679.66 | −143.01 (bills EXCEED gross) | MATCH |
| 5795 | 1051.03 | 1001.03 | 1079.39 | −28.36 (bills EXCEED gross) | **WRONG — see below** |
| 5797 | 1516.85 | 1544.48 | 1223.73 | 293.12 | MATCH |
| 5798 | 987.85 | 927.85 | 1007.07 | −19.22 (bills EXCEED gross) | MATCH |
| 5799 | 2002.65 | 2523.91 | 1603.35 | 399.30 | MATCH |
| 5800 | 1662.10 | 1407.40 | 1454.02 | 208.08 | MATCH |
| 5801 | 1558.27 | 1334.02 | 1524.38 | 33.89 | MATCH |
| 5802 | 2079.85 | 2104.84 | 1954.85 | 125.00 | MATCH |
| 5803 | 1684.05 | 1624.05 | 1407.79 | 276.26 | MATCH |

**Verdict, 12 of 14**: the HEADER (gross_pay/net_pay) is right — net_pay ties to
the signed AlwaysTrack `total_due` exactly. The side that's wrong is the
`driver_bills` DETAIL: every one of the 14 has only 1–3 bills linked against
2–5 real pay_lines/loads in the signed document, so `sum(bills)` never equals
`gross_pay` by construction (bills are incomplete, not the settlement itself).
2 of 14 (5793, 5798) show bills *exceeding* gross — a distinct sub-pattern
(over-captured detail rows, not under), still header-correct against truth.

**★ 5779 and 5795 — HEADER ITSELF IS CURRENTLY WRONG, AND I KNOW EXACTLY WHY.**
Both were CORRECTLY fixed by my own GO 1/GO 2 backfill (PR #22042,
2026-09-13T20:04:58Z) — deductions_total corrected to the real evidenced value,
net_pay landing exactly on the signed `total_due`:
  - 5779: net 1397.66 → **1387.66** (deductions 50.00 → 60.00) — matched signed truth 1387.66.
  - 5795: net 1001.03 → **789.04** (deductions 50.00 → 261.99) — matched signed truth 789.04.

**88 minutes later, both were REVERTED back to their pre-fix wrong values**, at
2026-09-13T21:32:17Z (5779) and 21:32:18Z (5795) — one second apart, `audit.row_changes`
shows `changed_by_role`/`changed_by_user_id`/`session_id` all NULL for both writes
(no app context — looks like a direct SQL write, not a UI action). No other
settlement was touched in that window. Current live state: **both sit at the
WRONG, pre-backfill value right now** — 5779 net_pay=1397.66 (should be
1387.66), 5795 net_pay=1001.03 (should be 789.04, a **$211.99** swing — the
single largest true-dollar error found in this sweep).

I did not re-apply the fix — WRITE NOTHING, report and stop, per this round's
instruction. The correct values are already known (they're what my own already-
merged, already-proven backfill computed) and re-applying them is a one-line
UPDATE per row whenever the Lead authorizes it; the open question is *what*
made that 21:32 write and whether anything else it touched needs checking.

The earlier "5779 duplicate settlement" note from mid-round is WITHDRAWN — the
second 5779 row (S-2026-0013, net=1720.09) is `status='cancelled'`, not a live
duplicate. Only one locked row exists for 5779; the real issue is the reversion above.

### B2 — the 397 uncategorized USMCA bank transactions

Confirmed scope: 398 = all non-voided USMCA bank_transactions (219 voided rows
excluded); 397 have `coa_account_id IS NULL`. Break down by whether the
existing rule engine (`banking-rules.engine.ts`, `suggested_account_id`) already
covers them:

| bucket | n | detail |
|---|---|---|
| **Existing rule already matches (high confidence)** | 303 | Spread across ~50 distinct active `rule_id`s already firing on these exact transactions — apply-ready, no new rule needed. |
| **No suggestion — needs a NEW rule** | 79 | See below |
| **No suggestion — genuinely ambiguous** | 15 | See below |

**New-rule candidates (79)**, by merchant:
  - **"Love's" (bare merchant_name, 72 txns, −$31,685.96)** — the single largest
    opportunity. `Love's Travel Stops` (22) and `Love's Tire Care` (9) already
    have active rules and match fine; the bare "Love's" merchant_name variant
    has none. One new rule targeting the bare pattern, aliased to whichever GL
    account the sibling "Love's Travel Stops" rule already uses (fuel), closes
    72 of the 397 in one shot.
  - Circle K Stores Inc (2, credits) — fuel/convenience refunds.
  - Office Depot (2: 1 credit $37.89, 1 debit −$116.43) — office supplies.
  - Pilot (1) — fuel/travel stop, same class as Love's.
  - Uber (1) — travel.
  - WEX INC (1) — fleet fuel-card settlement.

**Genuinely ambiguous (15)** — named-person/entity Zelle payments and
unlabeled instruments, each needs a human to say who/what, not a pattern rule:
  - 7 distinct named-payee Zelle payments, 2 memo'd `"for Settlement"` (Justin
    Galvez, David Trujillo) and 1 to **TIO PERFUMES 2 LLC** (×2, −$800 / −$2,600)
    — an entity name unrelated to trucking; flagging for owner clarification,
    not guessing.
  - "Check 1025" (no payee), "PROCESSING CHECK ON 09/13" (no payee).
  - "Relay" (−$2,581.25) — on the **USMCA FREIGHT checking account**, not the
    Relay Fuel Wallet sub-account already closed out in ROUND 24.5. Likely a
    funding transfer; flagging as related-but-separate from that closed item,
    not reopening it.
  - "TRANSFER USMCA FREIGHT SOLUTI:Juan Hernandez" (−$345), "Cash Deposit
    Processing" (−$12), one stray "Wire Transfer Fee" variant not caught by
    the existing Wire Transfer Fee rule (25 of 26 other instances already match).

No bulk categorization performed. TRANSPORTATION not touched (frozen, not
in scope of this query).

### Three named items
1. Missing Relay week 08-07..08-12 — stays open, office's thread, not reconstructed.
2. No real USMCA card mapped — still open, unchanged since ROUND 24.5 (test card voided, no real card invented).
3. Intercompany — CLOSED per owner ruling ("IT IS USMCA FUEL EXPENSE"), not re-raised.

### Correction taken
ROUND 24.4's "8 of 9 zero-rate drivers" was wrong; using CC-3's re-verified
number going forward: 25 active USMCA drivers, 18 with a rate, 7 without.

### Freeze acknowledged
No mdata.loads writes, test bookings, reservations, or number-minting actions
in USMCA until the owner confirms 13596-onward manual entry is complete.

**Deadline 2026-09-15 12:00 UTC — filed within window.**

---
## 2026-09-14 — ACK: ALL-SEATS bus-discipline directive

INBOX-CC-1.md was stale (last written 09-13 14:33) exactly as measured. Read it in full; two of
its three items were coordination-only (no action required), one was real and unactioned:
CC-2's ACTION NEEDED post (source_fuel_transaction_id column, blocking their fuel-ingestion
expense-repoint). Shipped now — see INBOX-CC-2.md this turn, PR #22096, sha f0f56fcf11.

Going forward: reading docs/bus/INBOX-CC-1.md at the start of every round before acting on any
chat-relayed instruction, per Rule 1. Freeze on USMCA load-number-minting actions acknowledged
and in force.
