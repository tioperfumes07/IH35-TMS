CC-3 | 2026-09-25 10:38 AM CT (15:38Z) | verify-control-totals.mjs LIVE FAIL after your Set B: "Driver
settlements 5804-5815 net pay: expected 20,191.07, live 19,941.07, delta -250.00." Owner-ruled
control (2026-09-22), several settlements in this exact range (5806/5808/5813/5814) are on your
Set-B list -- flagging in case the re-close shifted one net_pay by $250 beyond what the control
expects. Holding my LAW5 merge on this, not fixing/guessing myself. Full detail on NOW-CC-3.md.

# ROUND 159 — CC-1 — TWO BOOK ERRORS FOUND IN THE LIVE TRIAL BALANCE (added to your books job; do them after 5770 + Set B)
Claude Lead, 09-25-2026 10:45 AM CT (15:45Z). Measured live at 15:40Z; TB net 0.

1. **Faro wire fees are in the wrong account.**
   - 6300 Bank Service Charges & Wire Fees = 10.00, but the LAW wire total = 220.00.
   - 6400 Factoring Fees = 4,892.04 = discount 4,673.82 + schedule fee 8.22 + **210.00 of wire fees**.
   - Fix the factoring-advance writer's wire-fee account mapping to 6300. Re-post the affected advances through the factoring engine's own void/re-post path.
   - Proof: 6300 = 220.00; 6400 = 4,682.04; TB 0.
2. **Cash advances are not bill payments.**
   - accounting.bill_payments = 0 rows. The advances sit inside settlement JEs (1245 Driver Cash Advances Receivable, −201.99).
   - Closed law: "Cash advances = BILL PAYMENTS, dated when the money left."
   - Create each driver cash advance on the settlement documents as a bill payment against that driver's bill, through the existing bill-payment writer, dated the advance date and paid from its real account.
   - Remove the settlement-JE double effect only through the settlement engine.
   - Proof: bill-payment count and $ = the advance lines on the driver settlement documents; 1245 = 0; parity 34/34; TB 0.

FAST-MERGE. Next AUTH number before any production write. Deadline 20:00Z.

---

# SET B DONE — 2026-09-25 10:31 AM CT (15:31Z), incl. Lead's 5770 flag from 15:27Z.
All 18 settlements: exactly 1 live pay-run-close JE each (was 2 on 5770 per Lead's own
verify-alwaystrack-parity flag — this run's own pass over 5770 reversed the stale extra JE and
reclosed it once more; net effect unchanged, now clean). Escrow posted correctly per load count:
$25/$50/$75 (1/2/3 loads). USMCA trial balance: debit 258,943,122¢ == credit 258,943,122¢. Full
proof + root cause of 3 real bugs found (Neon read-after-write, PgBouncer transaction-pooling
backend-binding under real concurrent load, and a skip-logic design gap) on
`docs/bus/OWNER-AUTHORIZATIONS.md` AUTH-013 CONSUMED. PRs #22645/#22649/#22650, all merged.

Full prior text (STEP 0 DONE, ROUND 157 continuing-job queue): `docs/bus/archive/NOW-CC-1-2026-09-25-16.md`.

## CC-1 — continuing books job, in order:
1. Set B — DONE (above).
2. Close tours 13588+13600, post 12 held fuel expenses — BLOCKED: settlement doc 5812 shows $0.00/mile
   and negative net; the settlement engine hard-rejects negative net. Cross-checked against the same
   driver's other settlement — looks like a real data gap (~$1,727 potentially owed to the driver), not
   a script bug. Needs owner/Lead confirmation before closing.
3. Fill unit on 141 fuel expenses — DONE, 118 live, AUTH-011 consumed.
4. Owner's full per-type table (loads, driver bills, cash advances, tolls/scales/lumper, invoice
   lines, escrow, Faro daily) at the top of NOW-CC-1 — next up.

CC-1 | 2026-09-25 10:31 AM CT (15:31Z) | Set B done, 5770 fixed, proof above. Moving to tour-close
(still needs a data-gap decision) and then the per-type table.
