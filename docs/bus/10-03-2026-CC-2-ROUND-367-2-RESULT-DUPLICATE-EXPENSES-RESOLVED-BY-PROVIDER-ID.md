# CC-2 — ROUND 367.2 / 367.8 RESULT — THE DUPLICATE GROUPS, RESOLVED AGAINST THE PROVIDER'S TRANSACTION ID

2026-10-03 · USMCA only, DIRECT endpoint, `SET LOCAL app.bypass_rls = 'lucia'` (bypass=true printed). TRANSPORTATION and
TRUCKING not read (frozen).

## The key

**The key is the provider's transaction ID**, i.e. the digits-only `fuel.fuel_transactions.transaction_reference`, per
company and vendor. Of 323 live USMCA fuel rows:

- **255** carry the provider ID.
- **68** carry no provider key and are NOT deduplicated on:
  - 3 are blank;
  - 65 are placeholders (`DEF-<load>-n`, `nofuelinv-<n>-n`) or parse fragments (`ustFluid`, `101 PINNACLE ROAD`, `62.410`).

Settlement-created expenses with no fuel row (lumper, DEF, scale) have **no provider key at all**. That is named, not invented.

## The groups

| # | Group | Provider ID (row 1 / row 2) | Verdict |
|---|---|---|---|
| 1 | 09-10 $340.00 | 99519143 / 99021341 | two real purchases |
| 2 | 09-09 $490.00 | 99448828 / 99055485 | two real purchases |
| 3 | 09-06 $640.00 | 99468434 / 99597828 | two real purchases |
| 4 | 09-06 $790.00 | 99036374 / 99323900 | two real purchases |
| 5 | 08-31 $1,005.59 | **99794138 / 99794138**, loads 13557 + 13571 | **DUPLICATE** |
| 6 | 08-26 $585.36 | **1848853 / 1848853**, loads 13543 + 13547 | **DUPLICATE** |
| 7 | $560.00 lumper | none, settlements 5807 (13578) / e4117991 (13585) | no provider key; different settlements and loads, so read as two charges |
| 8 | $70.61 DEF | none, settlements 5789 (13550) / 5799 (13571) | no provider key; same reading |
| 9 | $29.43 DEF | none, settlements 5785 (13538) / 5792 (13547) | no provider key; same reading |
| 10 | $15.25 scale | none, settlements 5786 (13548) / 5793 (13565) | no provider key; same reading |
| 11 | $15.25 scale | none, settlements 5784 (13528) / 5786 (13548) | no provider key; same reading |
| **12 (new)** | $510.61, 92.018 gal | **99530579 / 99530579**, load 13533 dated 08-20 + load 13548 dated 08-26 | **DUPLICATE**. One transaction cannot carry two dates. A date-and-amount grouping missed it; the provider key finds it. |

**3 duplicates. Fuel expense is overstated by $2,101.56** (510.61 + 585.36 + 1,005.59).

All 6 rows are `posted`, carry 2 live postings each, and none is bank-matched.

## The cause, and the writer

`apps/backend/src/feed/seed-settlement-document.service.ts` `seedFuel` hashed
`alwaystrack:<company>:<LOAD>:<date>:<vendor>:<invoice>`. When the same AlwaysTrack invoice was printed on two drivers'
settlements for two loads, the two copies got different hashes, so `fuel_tx_source_row_hash_uk` never fired.

## Fixed (PR in flight)

**Writers:**

- `seedFuel`:
  - same provider ID on the same load = the re-run;
  - on another load = refused by name: `fuel_provider_transaction_already_recorded`.
- Settlement Creator fuel line and the manual fuel form: both refuse by name before the INSERT. **Both also never set
  `source_row_hash`, which is NOT NULL since 202614220000.** Every Settlement Creator fuel line and every manual fuel
  entry was failing with 23502. That is fixed in the same PR, keyed on the provider ID.
- One shared helper: `apps/backend/src/fuel/fuel-provider-reference.ts`.

**Database (202615370600):**

- A BEFORE INSERT/UPDATE trigger refuses a second live row with the same company + vendor + digits reference (23505),
  advisory-locked against the race.
- It is a trigger, not a unique index, because the 3 pairs are real posted money.
- It never touches existing rows, so voiding one of the pairs stays allowed.

**Rehearsed on a prod fork** (`br-square-field-akbrky2a`): applied, then the second pass applied 0. Each case below
rolled back:

| Case | Result |
|---|---|
| Copy of 99794138 | REFUSED 23505 |
| Copy of a single-recorded ID | REFUSED |
| Copy of `ustFluid` | allowed |
| Void one row of the 1848853 pair | allowed |
| Re-reference a row onto 99530579 | REFUSED |

**Guards:**

- `verify-fuel-expense-is-unique-per-provider-transaction.mjs` (live). The 3 pairs are on a shrink-only list; it fails
  if any pair is added, and fails if a listed pair is gone but not removed.
- `verify-duplicate-expense-is-refused-or-ruled-never-silent.mjs` (static). Every writer of `fuel.fuel_transactions`
  either refuses by provider ID or is keyed by it (import `ref:<id>`, Relay `relay:<txn>`).
- Negative control: removing the route's check fails the static guard.

## Owner AUTH needed (REVERSE → VOID; nobody hand-writes it)

For each pair, the owner says which load the purchase belongs to; the other copy is reversed, then voided:

| Provider ID | Amount | Fuel row A (load) | Fuel row B (load) |
|---|---|---|---|
| 99794138 | $1,005.59 | 152e088a (13557) | e8415607 (13571) |
| 1848853 | $585.36 | 73caf437 (13543) | 737e377b (13547) |
| 99530579 | $510.61 | dfb30f22 (13533, 08-20) | 432798f4 (13548, 08-26) |

Also on the board: the 65 non-key references are an AlwaysTrack parse defect in the seed plan, because the invoice
column carries text fragments. The writer that parses the truth JSON should leave the reference blank rather than store
a fragment.
