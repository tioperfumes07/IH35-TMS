# USMCA Settlement/Dispatch/Factoring Reconciliation — 2026-09-07

## OWNER CORRECTION (2026-09-07 21:57): settlements are the 4-digit AlwaysTrack doc numbers, NOT `S-137xx`
- A settlement number is a **4-digit AlwaysTrack document number** (e.g. 5786). Loads never carry an "S-".
- The DB `S-13642…S-13656` / `S-137xx` values are an **unlinked internal counter**, not real settlements. They must be voided/relinked, never reported as settlements.
- **The real USMCA driver settlements = 21 signed documents: 5774, 5777–5796. Total driver pay due = $27,487.36 across 161 load-lines** (source: `usmca-settlements-from-signed-docs.csv`, `usmca-settlement-lines-from-signed-docs.csv`, parsed from the signed PDFs).
- Because the `S-137xx` linkage is wrong, BOTH prior reconciliations (Claude's per-driver delta table and the per-load table below) are **not trustworthy for moving money**. No settlement is closed/paid until each DB settlement is rebuilt to equal its signed 4-digit doc, dollar-for-dollar. Owner enters nothing by hand.
Source of truth: signed settlement PDFs in ~/Downloads (Driver_/Company_Settlement_5753-5796), the AlwaysTrack dispatch board screenshots (owner, 2026-09-07), the Faro factoring report, and the live Neon DB (br-fancy-credit-akjnd07a, USMCA 5c854333, bypass_rls=lucia).

## Rule applied
- Loads on the current AlwaysTrack board stay in DISPATCH (open / in-transit / delivered-pending) and are NOT settled yet.
- Every earlier load with a signed settlement doc must be SETTLED + FACTORED + PAID.

## What is already correct (measured live, 2026-09-07)
- **17 USMCA driver settlements CLOSED + GL-posted**, dollar-balanced (S-13508, S-13642..S-13656 minus cancelled, plus S-13728/13730), covering every delivered load that has a signed settlement.
- **51 factoring advances (FA/USMCA) GL-posted** — all `advanced`, each with a posting key.
- **Open settlement shells** exist for every current in-transit board load: S-13726 (13564/13575), S-13727 (13569/13577), S-13729 (13571/13574), S-13733 (13576), S-13734 (13578) — these correctly remain OPEN.
- Loads 13517, 13524, 13527, 13531, 13533, 13539, 13540, 13579 exist ONLY as `is_sample_data=true, cancelled` → correctly excluded (Rule 49); NOT gaps.
- Pre-08/07-cutover loads (13471–13507) are Transportation-entity signed settlements → correctly absent from USMCA (Rule 49).

## Recommended posters for the 5 residual items (existing service layer only — no new GL math)
- **13563 / 13570 / 13572**: `reverseSettlementBillPaymentInClientTx` on S-13725, S-13728, S-13730 → reopens the shell, deactivates lines, restores held bills; loads then render in dispatch like their sibling shells. (Void = reversal, register kept.)
- **13554**: attach to Leonel's open shell via `confirmPresettlementLink` (signed doc 5790, TOTAL 1,452.75); do NOT re-close until the owner signs the period.
- **13340047**: seed in dispatch via Book Load once customer + rate are confirmed from the AlwaysTrack load doc (not fabricated).

## Action items (5) — source-verified, no guesses

- **Load 13554** (LEONEL ANTONIO MORALES NOGUEZ): DB=delivered_pending_docs/(none), signed=USMCA 5790, board=no → FIX: USMCA signed settlement exists but load not attached to any DB settlement
- **Load 13563** (RAFAEL ROGELIO RIVERO REYNOSO): DB=delivered_pending_docs/S-13725:closed, signed=(none), board=YES → FIX: on board but DB settlement CLOSED -> verify signed doc; if none, reverse settlement & keep load in dispatch
- **Load 13570** (CARLOS MAURICIO CARVALLO): DB=delivered_pending_docs/S-13728:closed, signed=(none), board=YES → FIX: on board but DB settlement CLOSED -> verify signed doc; if none, reverse settlement & keep load in dispatch
- **Load 13572** (GENARO GUERRERO CHAVEZ): DB=delivered_pending_docs/S-13730:closed, signed=(none), board=YES → FIX: on board but DB settlement CLOSED -> verify signed doc; if none, reverse settlement & keep load in dispatch
- **Load 13340047** (): DB=MISSING FROM DB/(none), signed=(none), board=YES → FIX: board load missing from DB -> create in dispatch

## Factoring tie-out vs Faro (measured live 2026-09-07, RLS bypass; Faro = `faro_canonical_import.csv`)

App: **51 advances**, gross **$151,740.00**, advance **$147,187.78** (all USMCA-scoped — Faro is
Transportation's portal but the fleet is USMCA, Rule 49 §3b; 0 advances remain under Transportation).
Faro canonical: **48 invoices**, gross **$147,065.00**, advance **$142,503.04**.

- **32 invoices match exactly** (gross + advance).
- **15 invoices: gross matches, advance is +$10.00 in the app** (13508, 13511, 13512, 13518, 13520,
  13523, 13526, 13536, 13537, 13543, 13548, 13558, 13559, 13564, 13568). Root cause: Faro charges a
  **flat $10 wire fee on top of the 1.5% factor fee** (e.g. inv 13508: Faro fee $47.50 vs app $37.50),
  so the app over-states the advance by $10 on each. Fix = fee model adds the $10 wire fee per advance.
- **APP_ONLY: load 13513** ($525 gross) — advanced in app, not in Faro canonical → verify vs Faro portal.
- **FARO_ONLY: invoice 13510** — in Faro canonical, no matching app advance → seed the advance.
- **3 app advances unlinked to any Faro invoice #**: FAC-2026-00001 ($3,000, no ref — suspected
  seed/dupe), FAC-2026-00050 (FARO-RECON-ITS-007, $350), FAC-2026-00051 (FARO-RECON-MPH-016, $3,800)
  → confirm each against the Faro portal export; void FAC-00001 if it has no Faro backing.
- Net advance delta **+$4,684.74** (app over Faro), driven by the 3 unlinked + 13513 (− 13510) + 15×$10.

Full per-invoice table: `usmca-factoring-reconciliation.csv`. These are non-GL corrections (advance
amount/fee + one void + one seed) done through the factoring service layer, not raw ledger edits.

## Full per-load table

See `usmca-load-reconciliation.csv`.
