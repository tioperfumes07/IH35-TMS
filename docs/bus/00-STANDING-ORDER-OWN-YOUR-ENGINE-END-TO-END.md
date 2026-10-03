# STANDING ORDER — OWN YOUR ENGINE END TO END. REPLACES PER-ROUND BOXES.

Owner, 2026-10-03: *"EACH CODER IS SUPPOSED TO FULLY AND COMPLETELY BUILD THEIR ENGINE AND ALL WORK —
MECHANICAL, FINANCIAL, ECONOMIC, MONEY — AND FULL LINKAGE AND WIRING AND CONNECTIVITY, ROUTE, DOUBLE,
RESERVE, REVERSE ETC, TO CUSTOMERS, VENDORS, DRIVERS, TRUCKS, TRAILERS, LOAD, SETTLEMENT, EXPENSE, BILLS,
BILL PAYMENTS — EVERY POSSIBLE TRANSACTION."*

**No more waiting for a round. You own your engine. Build all of it.** The lead stops issuing per-item
boxes; the owner is paying for those tokens and they are not buying engines.

## YOUR ENGINE IS NOT DONE UNTIL ALL OF THIS IS TRUE
1. **Mechanical** — every route mounted, every screen reachable, every button does the thing.
2. **Money** — every transaction posts, balanced, to the role-resolved account. Never a literal account.
3. **Reverse** — void, reverse, reinstate, all linked. `reverseJournalEntryNoFlip`. Original never flipped.
4. **Reserve / double** — idempotent. Run it twice on a fork, nothing duplicates, nothing double-pays.
5. **Spine** — `writeTransactionSourceLink` in the SAME transaction as the posting. No exceptions.
6. **Linkage, both ways** — to `customers · vendors · drivers · units · trailers · equipment · loads ·
   settlements · expenses · bills · bill_payments · invoices · payments · work_orders · files`, and back.
   **A block with no linkage declaration is not done.**
7. **Company** — `operating_company_id` NOT NULL, on every unique key, never `tenant_id`, never crosses.
8. **WORM** — no financial delete except the governed purge.
9. **Single-fire** — `withJobLease` on every scheduled path.
10. **One named guard, ratcheted, shrink-only**, every debt entry reasoned, baseline **committed**.

**Ten of ten or it is not done. Report per table, with the live query pasted and the guard name.**

## THE WHOLE OPEN BOARD — NOTHING ELSE IS COMING
- **CC-1** — F-1 escrow over-release (refuse in the DB, not the service; `verify-escrow-never-over-releases`
  ceiling 0) · then your full engine per the ten points. `damage_loss` migration is **CANCELLED**.
- **CC-2** — the silent expense posting path (1,926 entries with no spine link, zero partial, so there are
  two call sites — name both, fix the silent one) · F-2 `1090` · F-3 `1295` + role `fuel_wallet_relay` ·
  R-2 fuel gallons per unit from the unit's own tank, 150 fallback only · then your full engine.
- **CC-3** — 13515 (reverse 2 postings, write the cancellation row, stamp the void, close the bypass) ·
  invoice spine path, 48 postings $178,938.00 · then Dispatch end to end, your full engine.
- **CURSOR** — cash flow: recourse = secured borrowing, so collections OPERATING, Faro FINANCING, and
  ASU 2016-15 investing does **not** touch the 1.5% reserve · 7-day unmatched must ALERT, not count ·
  the two bank-match defects · then your full engine.

## ALREADY SETTLED — READ THE FILE, DO NOT ASK, DO NOT RE-MEASURE
`docs/bus/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md` · `~/Desktop/CPA ANSWERS.docx` ·
`claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`.

Live already: escrow cap $2,500 · net-pay floor 5% overridable · capitalize $7,000 · Faro constants match
the signed contract · `6400`/`6405`/`6830` off Bank Charges under `6810` (done on prod, trial balance
2,178,029.25 / 2,178,029.25 / .00) · the driver escrow `2100-00-nnn` **is** the damage account, one per
driver, shortfall to `6175` — **no new account** · classes OUT.

Wrong-sign family is closed at **five** accounts. Stop sweeping for a sixth.

## THE ONLY THING THAT REACHES THE OWNER
A finished engine with live proof. Nothing else. **Fix writers, not rows** — every row here is about to be
purged. **Nobody seeds, feeds or demo-loads anything into USMCA, for any reason, including proof.**
