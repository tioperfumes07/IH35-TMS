# THE GATE REGISTER — RECONCILED AGAINST THE OWNER'S LAWS — 2026-10-02
Claude Lead. The owner's 58-item list, reconciled. This is the list that must reach ZERO before the
purge. It is shorter than 58 because the purge dissolves data instances, and because some items were
already closed or were measured wrong.

**The reframe that matters:** a data defect is almost always an engine defect wearing a number. The
purge erases the number. **The engine stays on this list.** G-10's "31 deadhead lines at $0.00"
disappears at the purge; the deadhead-pay calculation that produced them does not. That is the
permanent solution the owner demands, and it is why this register converts every data item into its
engine requirement rather than deleting it.

Legend: **[E]** engine/code · **[V]** visual · **[I]** infrastructure · **[M]** master data (survives
the purge, must be clean) · **CLOSED** · **DISSOLVED** (the purge zeroes it; its engine is listed)

---

## CLOSED — verified, off the list

- **1, 2 — the 21 TRANSPORTATION loads under USMCA.** DISSOLVED. The purge deletes every load. There
  is no paid money on any of them (all three invoices $0.00 paid, not_factored). No separate removal.
- **8 — G-02 "accounting.bills = 0, no A/P subledger."** **FALSE.** 93 USMCA bills exist. The register
  was four days stale and I pushed it into a live order. CC-1 nearly rebuilt a working subledger.
- **9 — G-03 "bill_payments = 0."** **FALSE.** 130 exist, and they tied to the bills to the cent.
- **55 — settlement row missing settlement_model.** DONE, #23780. All 64 settlements carry it and the
  database now refuses a missing one. CC-3's load drawer unblocked, #23961.
- **44 — the E2E fixture row.** DISSOLVED by the purge.
- **45 — 13625 / 13627 / 13638 false canceled_at.** DISSOLVED by the purge.
- **Conflict-marker break.** CLOSED, #23959, with `verify-no-merge-conflict-markers` guarding it.

---

## [E] MONEY ENGINES — CC-1 — the critical path, in dependency order

1. **The single settlement poster.** Two competing posters exist: `closeSettlementPayRun` (what Close
   actually runs) and `postSettlementBillPayment` (the owner's ruling, already built). Make B the
   engine, retire A at the call site, guard against A returning. *(was the hidden cause behind 10)*
2. **G-04 — the settlement GL chain has never run.** `driver_settlement_gl_runs` 0,
   `driver_settlement_gl_bills` 0. Build it on B: per-load A/P bill with its own JE.
3. **The per-load A/P bill, numbered as the load.** Owner's ruling. 131 of 136 driver bills already
   number this way; the engine must guarantee it, not happen to do it.
4. **Cash advance as a bill payment against that load's bill.** Owner's ruling. *(was 9's engine)*
5. **Driver escrow — 2100 series, liability, $25 default line, X to remove.** Nothing to do with
   factoring. *(was 16 / G-11)*
6. **Deadhead pay calculation.** *(was 12 / G-10 — 31 of 67 lines computed $0.00)*
7. **G-09 — the item catalog + mapping engine.** 4 items missing, 4 name-drift, 2 wrong-item.
8. **The document-expense ingestion engine.** *(was 7 / G-01 — the engine, not the 180 lines)*
9. **The settlement-line categorization engine** — item, posting account, category always set.
   *(was 11 / G-05)*
10. **The 9000 Ask My Accountant path** — nothing lands there silently. *(was 13 / G-08)*
11. **The 1090 undeposited-funds clearing engine.** *(was 14 / G-06)*
12. **The 2510 Dreamline payable payment side.** *(was 15 / G-07)*
13. **The 6300 bank-service-charge path** — $174K gross for $220 net means the engine churns.
    *(was 22 / G-18)*
14. **G-16 — commission the Check Creator.** Built, never issued a check: 0 stock settings, 0 check
    numbers, 0 checks.
15. **Reclassify — the invoice / bill_payment line rewrite.** *(was 46)*
16. **E-17 Fleet roster integrity.** The fleet is **16 trucks**, not 43 rows; 7 belong to
    TRANSPORTATION. Every cost-per-mile on the maintenance boards is wrong until this lands.
17. **The Settlement Creator** — QuickBooks subtotals, escrow default 25 with X, all totals at the
    bottom for verification against AlwaysTrack, the PDF button printing both company and driver
    documents from `docs/design/boards/settlements/SettlementDocumentDesigns.html`, complete linkage.
18. **The zero-reset engine** — built, tested on a throwaway branch, **left unrun**. The owner runs it.
19. **The table-and-stamp snapshot** as an Excel deliverable, before the purge.
20. **Load-cancel settles revenue recognition** + **import resolves the operating entity from source**
    + `verify-no-cross-entity-loads`. *(was 3, 4, 5 — CC-1 reports built; verify in code and guard)*

## [E] CC-2 — Banking · Factoring · Fuel

21. **Categorize-and-match engine, every account.** A bank line matched to its document, or
    categorized with unit/driver/load, and *that* writes the GL. This is what 2170 needs to ever
    clear. **Fuel cards are bank accounts** — Relay and Dreamline post this way, nothing auto-posts.
    *(replaces 51; ROUND 43 lifted — different accounts, nothing duplicated)*
22. **The factoring purchase engine requires a load.** *(was 18 / G-13 — $34,210 advanced with none)*
23. **1230 is the single factor reserve holdback; 1236 retired.** Vocabulary law: escrow means driver
    escrow only. CC-2 confirms every KPI/tile/drill reads 1230 + 1235; Lead authors the migration.
24. **`posted_to_gl` derived from the journal entry's existence**, never set by hand. 75 Relay rows
    claim posted with no entry.
25. **E-28 Complaints against a driver.**
26. **9 older factoring guards red on main.** *(was 50)*
27. **Factoring KPIs** · **Banking KPIs** *(31, 32)*

## [E] CC-3 — Customers · Vendors · Driver Profile · Dispatch

28. **Canonical customer + vendor engine** and **[M] the duplicate removal: 22 customer groups, 2
    vendor groups.** Runs **before** the purge — master data survives, so it must survive clean.
    LOVES and LOVES TRAVEL STOPS are one vendor (owner's ruling, named exception). *(was 43 — the
    1,203 figure was system-wide, not USMCA)*
29. **E-23 Samsara fuel push** · **E-30 Driver messaging** · **E-31 Samsara Routes** ·
    **E-32 Documents/Forms BOL-POD** · **E-03 unit_stop_events** *(25–30)*
30. **The telematics + geocode preservation engine** — natural keys, no FK to anything purgeable,
    plus the Excel export. Cannot be re-fed.

## [E] CURSOR — Legal

31. **Legal backfill from the signed documents** *(39)* · **legal money through the expense/invoice
    engines** *(40)* · **deadline + expiry alert engine** *(41)* · **legal block on customer, vendor,
    driver and unit profiles** *(42)*. The linkage engine itself is built (#23946, #23949).
32. **Stop pushing with `--no-verify`.**

## [V] VISUALS — identical to the boards, none done

33. **Banking designs** · **Factoring redesign** *(CC-2)* — 33, 34
34. **Customers** · **Vendors** · **Driver Profile** redesigns *(CC-3)* — 35, 36, 37
35. **Maintenance** — 9 boards *(CC-1 engines, screens with CC-1 end to end)*
36. **The app-wide filter audit** — customers opens on With transactions 65, vendors on 34, drivers on
    Active 19, banking on the 931/16/947 segmented control; 34px controls, 132px dates, 120px money,
    KPI tiles across, em dash for missing.

## [I] INFRASTRUCTURE

37. **The 12 named ambient static failures.** 33 → 20 so far: I fixed
    `verify-ops-scripts-assert-not-production` (a real AUTH-200 production-safety hole plus a regex
    that read English prose as SQL) and declared `REQUIRES_LIVE_DB` on 7 live-money guards. The 12
    are assigned by name per seat. *(was 53)*
38. **Frontend autoDeploy is OFF** — `ih35-tms-web` only deploys when something calls the API, which
    is why six merged engines were invisible for an hour. Wire it or make a failed web build fail
    loudly. *(CC-1)*
39. **4 applied-but-never-committed migrations** — 202614420000, 202614430000, 202614560000,
    202614570000. Recover the real applied SQL from the ledger; never reconstruct from memory. *(52)*
40. **8 missing sub-nav tabs** — banking, drivers, maintenance *(54, Cursor)*
41. **§23 batch grids** — Deposits, Settlements, load_id picker per row *(57, CC-2)*
42. **Neon housekeeping** — delete `br-bold-lab-akfjr9dq`, sweep 84 stale branches *(56)*
43. **Lead's two unmerged branches** *(58)* — mine, and mine to land.

## DISSOLVED BY THE PURGE — their engines are listed above, the numbers are not work
7 (G-01 lines) · 11 (G-05 lines) · 12 (G-10 lines) · 13 (G-08 postings) · 14 (G-06 residue) ·
15 (G-07 balance) · 16 (G-11 $25) · 17 (G-12 doc 5812) · 18 (G-13 $34,210) · 19 (G-14 inv 87) ·
21 (G-17 docrefs 5817/5818/5819) · 22 (G-18 churn) · 44 · 45 · 47 (AUTH-191) · 48 ($2,000 short) ·
49 (43 Relay fills) · and the manual JE `43d6f4bf` $166,743.94 Faro residual plug.

## OWNER-ONLY, NOT A CODER ITEM
**20 / G-15 — his spreadsheet, not the system:** load 13526 maps to settlement **5779** (his sheet
says 5772) and load 13607 to **5813** (his sheet says 5816). The signed PDFs and the app agree with
each other. Correct the sheet, change nothing in the system.

---

**COUNT: 43 items to zero**, not 58. Fifteen dissolve at the purge, five were already closed, two
were measured wrong and were never real, and one belongs to the owner's spreadsheet.

An item is at zero when the engine is correct in code, the screen matches its board, the guard holds,
and the deploy is live on **both** services. Not when it merged.
