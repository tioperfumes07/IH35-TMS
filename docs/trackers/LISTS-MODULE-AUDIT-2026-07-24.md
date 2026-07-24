# Lists module — audit (2026-07-24)

Standard: `docs/specs/DEFINITION-OF-DONE.md` (5 DONE layers A–E + 5 VERIFY layers). CI-green is the
floor. Every finding below carries repo proof (`file:line`). Findings needing prod are labelled
**UNVERIFIED — needs live check** with the blocker named; **no prod DB connection was made** (CLAUDE.md
§1.5 — gated, ask every time).

**Base:** `origin/main` @ `2088757285`; prod `/api/v1/healthz/shallow` → `version: 2088757` (match).
**Desktop pack blocked:** `~/Desktop/IH35-CURSOR-AUDIT/` → `Operation not permitted` (macOS TCC). This
file is the in-repo stand-in.

**PROD READ (owner-authorised 2026-07-24, read-only, Neon `br-fancy-credit-akjnd07a`/`neondb`).** All
row facts below are exact counts taken inside a transaction with
`SELECT set_config('app.bypass_rls','lucia',true)`, with a **positive control**
(`catalogs.accounts` = 1392, matching `pg_stat` `n_live_tup`) proving the session was not RLS-masked.
Shape facts come from RLS-immune `pg_catalog` / `information_schema` / `pg_policies`.

### Prod shape + row truth (drives every fix below)

| catalogs.* | rows | active/entity (TRANSP/TRK/USMCA) | opco col | RLS forced | → count-spec `companyScoped` |
|---|---|---|---|---|---|
| `journal_entry_types` | **16** | 16 (global) | ✗ | yes (`qual: true`) | **false** |
| `complaint_types` | 295 | **271 / 12 / 12** ⚠ | ✓ | yes | true |
| `dot_violation_types` | 213 | 71 / 71 / 71 | ✓ | yes | true |
| `cargo_claim_reasons` | **0** | 0 / 0 / 0 | ✓ | yes | true |
| `load_cancellation_reasons` | 63 | 12 / 12 / 12 | ✓ | yes | true |
| `driver_termination_reasons` | 48 | 16 / 16 / 16 | ✓ | yes | true |
| `void_cancel_reasons` | 18 | 6 / 6 / 6 | ✓ | yes | true |
| `account_types` | 15 | 15 (global) | ✗ | **RLS OFF** | **false** |
| `detail_types` | 144 | 144, **opco all NULL** | ✓ | yes | **false** ← trap, see LST-F15 |
| `tire_positions` | **0** | 0 (global) | ✗ | yes | false (already) |
| `catalog_registry` | **8** | 8 (global) | ✗ | yes | n/a |
| `dispatcher_error_reasons` | 25 | 25 (global) | ✗ | yes, **role-scoped only** | — (next conversion) |
| `posting_templates` / `account_role_bindings` | **0** / **0** | — | ✗ / ✓ | yes | (Cursor's lane) |

**Exact badge understatement caused by LST-F1 + LST-F5, per entity:**
**TRANSP 548 active rows** (safety 342 · dispatch 12 · drivers 16 · accounting 178) —
**TRK / USMCA 289 each**. This is the size of the live lie on the hub today.

**Scope:** the Lists module surface — hub map, per-domain hubs, domain count badges, catalog registry,
the catalog CRUD routes behind them, and the guards that hold them. Accounting/banking catalogs are
Cursor's lane and are only flagged, never proposed for change here.

---

## HAVE (verified working — repo proof)

| # | What | Proof |
|---|---|---|
| H1 | Hub map + per-domain hub render from ONE `DOMAIN_CONFIG` via `sortDomainsForDisplay` — no second hand-ordered copy, new catalogs auto-place | `apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx:21,157` |
| H2 | All 5 merged per-entity conversions have a guard **wired via `verify-steps/`** (Rule 17 satisfied) | steps `1418` fleet, `1419` driver_load_statuses, `1420` equipment_types, `1354` driver_termination_reasons, `1355` customer_quality_reasons |
| H3 | Count route enforces membership + sets the entity GUC before every domain count | `apps/backend/src/lists/lists-counts.routes.ts:28-40` |
| H4 | `companyScoped`-vs-actual-shape guard is real and **throws on an unclassified table** (cannot silently drift) | `apps/backend/src/lists/lists-module-count-spec.scoping.test.ts:29-40` |
| H5 | Catalog registry sets the entity GUC so per-entity previews/counts don't read a false 0 (the #3403 fix) | `apps/backend/src/catalogs/catalog-registry.routes.ts:222-227,274-277` |
| H6 | Count query degrades instead of 500-ing when a catalog table is absent (`to_regclass`) | `apps/backend/src/lists/lists-counts.routes.ts:49-62` |

---

## MISSING

### LST-F1 — 9 live catalogs are excluded from the domain counts (badges undercount)
`LISTS_MODULE_COUNT_SPECS` is the sole source for every domain badge, and it omits catalogs that are
live in `DOMAIN_CONFIG` with real tables and real CRUD routes:

| Domain | In hub map | In count spec | Omitted (table verified in repo) |
|---|---|---|---|
| safety | 6 | 3 | `complaint_types`, `dot_violation_types`, `cargo_claim_reasons` |
| dispatch | 5 | 4 | `load_cancellation_reasons` |
| drivers | 10 | 9 | `driver_termination_reasons` |
| maintenance | 10 | 9 | `services-catalog` (see note) |
| accounting | 17 | 12 (+literal) | `account_types`, `detail_types`, `void_cancel_reasons` |
| names_master | 5 (1 live) | 0 | `brokers` |
| fuel / fleet | 12 / 10 | 12 / 10 | — complete |

Proof of omission: `apps/backend/src/lists/lists-module-count-spec.ts:11-93`.
Proof the tables + routes are real: `catalogs.complaint_types` `catalogs/safety/complaint-types.routes.ts:44`;
`catalogs.dot_violation_types` `.../dot-violation-types.routes.ts:83`; `catalogs.cargo_claim_reasons`
`.../cargo-claim-reasons.routes.ts:71`; `catalogs.load_cancellation_reasons`
`catalogs/load-cancellation-reasons.routes.ts:100`; `catalogs.driver_termination_reasons`
`mdata/driver-safety-events.routes.ts:113,138`; `catalogs.void_cancel_reasons`
`catalogs/void-cancel-reasons.routes.ts:110`; `catalogs.account_types` + `catalogs.detail_types`
`catalogs/accounting/account-type-catalog.routes.ts:72-73`.

*Note (maintenance):* "Maintenance Services Catalog" resolves to `maintenance.pm_schedules` /
`maintenance.work_orders` (`catalogs/maintenance/services.routes.ts:112,114`), not a `catalogs.*` table —
so its exclusion may be correct by design. **UNVERIFIED — needs a decision, not a live check:** is the
services catalog a Lists catalog (count it) or an operational view (drop it from the hub map)?

*Note (names_master):* Brokers reads `listCustomers` (`pages/lists/names/BrokersListPage.tsx:4`) — a
filtered `mdata.customers` view, not a catalog table. So the badge reads **0 while the page lists rows**.

**Impact:** the Lists hub reports a smaller number than the module contains, on 6 of 8 domains.
Layer E (evidence) fails: the badge is not a true count.

### LST-F2 — no guard asserts hub-map ↔ count-spec coverage parity
`DomainCountParity.test.ts` only asserts both badges read the *same source*
(`components/DomainCountParity.test.ts:12-23`) — so both surfaces are consistently wrong. Nothing
asserts that every `live: true` catalog in `DOMAIN_CONFIG` appears in `LISTS_MODULE_COUNT_SPECS`.
`grep -rl LISTS_MODULE_COUNT_SPECS scripts/` → **no hits**; only the spec, the route and the scoping
test reference it. This is why LST-F1 could accumulate across 6 domains unnoticed.

### LST-F3 — `driver_load_statuses` is unreachable from the Lists module
Converted per-entity by #3403, present in `catalogs.catalog_registry`
(`catalog-registry.routes.ts:11,68`), page mounted at **`/catalogs/driver-load-statuses`**
(`routes/manifest.tsx:4016`) — but it is **absent from `DOMAIN_CONFIG`** and
`grep -rn "driver-load-statuses" apps/frontend/src/pages/lists/` → **zero hits**. No click path from
the Lists hub reaches it. Same defect class as SAF-F22 (mounted route, zero inbound links).
Layer A fail.

### LST-F4 — catalog registry: writable codes, hardcoded readers
`POST /api/v1/catalogs/registry` accepts any code matching `^[A-Z][A-Z0-9_]+$`
(`catalog-registry.routes.ts:24`), but:
- `fetchCatalogStats` returns `{item_count: 0}` for any code outside a hardcoded map of 8
  (`:64-87` — `if (!sql) return { item_count: 0 }`), and
- the preview route validates `:code` against an 8-value zod enum (`:9-18,21,267-271`) → **400** for
  anything else.

So an Owner/Admin registering a 9th catalog gets a row that displays **item_count 0 forever** and whose
preview hard-fails, with no error at write time. Layer B/D fail (accepted-by-API ≠ done).

---

## DRIFT

### LST-F5 — Accounting badge is wired to a literal `3` while the real table seeds `16` ★
`lists-module-count-spec.ts:96` → `export const ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT = 3;`
`lists-counts.routes.ts:69-71` → `if (module === "accounting") count += ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT;`

But journal entry types stopped being a hardcoded 3-row array: AF-5 made it a **real table**, and the
route now reads it (`catalogs/accounting/factory.ts:512-529`, explicitly: *"used to be a hardcoded 3-row
in-file array (the last true SILENT-STUB) … It is now a REAL `catalogs.journal_entry_types` table"*).
The migration seeds **16 codes** (`db/migrations/202607120000_af5_journal_entry_types_catalog.sql`:
GENERAL … RECLASSIFICATION).

**The stub removal was half-done** — replaced in the route, left in the count. The Accounting domain
badge is understated by **13** and cannot move when the catalog changes. Rule 16 (fix-not-patch): the
root fix is a count-spec entry, not a bigger literal.
**UNVERIFIED — needs live check:** actual prod row count and whether `journal_entry_types` carries
`operating_company_id` (drives `companyScoped`). Blocker: prod DB access is gated (§1.5).

### LST-F6 — stale per-entity comments contradict the code they sit on
`lists-module-count-spec.ts:63-65` states *"STILL GLOBAL: equipment_types (dual write-surface —
converted in a follow-up PR)"* while `:70` already has `equipment_types … companyScoped: true`
(converted by #3405). The same stale claim is repeated in
`lists-module-count-spec.scoping.test.ts:8-11`. A future agent reading the comment will "fix" a
correct line — this is the exact mechanism that produced the hazmat and enum reversals.

### LST-F7 — catalog CRUD living outside `catalogs/`
`driver_termination_reasons` CRUD (`GET/POST/PATCH /api/v1/catalogs/driver-termination-reasons`) is
implemented in **`apps/backend/src/mdata/driver-safety-events.routes.ts:113-268`**, not under
`apps/backend/src/catalogs/`. Functional, but it means `verify-catalog-factory-coverage.mjs`-style
sweeps over the catalogs tree cannot see it, and the next conversion (`dispatcher_error_reasons`,
whose route is likewise in `mdata/dispatcher-safety-events.routes.ts`) will inherit the same blind spot.

### LST-F8 — 4 permanent "in preparation" placeholders on the hub
`names_master` ships Shippers / Consignees / Lenders / Insurance Carriers as `live: false`
(`AllCatalogsMap.tsx:146-150`), rendered as `CATALOG_IN_PREPARATION`. Layer A treats a ComingSoon twin
as not-done. Either build them or record them as explicitly deferred in
`docs/trackers/DEFERRED-ITEMS.md` — silence is the defect.

---

## WILL FAIL

### LST-F9 — the guard named for this exact defect cannot catch it ★
`verify:no-hardcoded-list-counts` runs in CI (`.github/workflows/ci.yml:645-646`) and scans **only 4
frontend hub-header files** for literal JSX count props
(`scripts/verify-no-hardcoded-list-counts.mjs:7-12,29-37`). The live hardcode (LST-F5) is in the
**backend** count source, which the guard never opens. The guard passes; the defect ships. Textbook
`guards-that-assert-the-defect` pattern: it guards the render layer after the hardcode moved to the
data layer.

### LST-F10 — silent count degradation on a missing table
`countModuleRecords` drops absent tables via `to_regclass` and returns the sum of the rest
(`lists-counts.routes.ts:49-62`). Correct for availability, but there is **no signal** — a domain whose
table is missing shows a smaller *plausible* number instead of an error. Same class as the
`recon-collector-green-on-no-data` dark-feed bug. Needs a structured warn (skipped-table list) surfaced
to the response or logs.

### LST-F11 — triple, inconsistent guard wiring
`verify-equipment-types-no-collision` is wired **three ways**: `package.json:407`,
`scripts/verify-guards/146-*.mjs`, and `.github/workflows/ci.yml:643-644`. DoD §4 states package.json
`verify:*` entries are FORBIDDEN and that guards live in `verify-steps/` only. It currently runs (via
ci.yml), so this is not a live hole — but a Rule-17 cleanup that deletes the package.json script would
**silently disable a load-bearing collision guard** (memory records migration 911 was kept precisely
because that guard depends on it). *(I initially mis-called this guard "not wired" from a
`verify-steps/`-only check — corrected here after finding the `verify-guards/` + ci.yml wiring.)*

### LST-F12 — accounting counts rely on RLS rather than an explicit filter
`accounts`, `classes`, `payment_terms`, `items`, `posting_templates`, `account_role_bindings` are
`companyScoped: false` (`lists-module-count-spec.ts:79-84`), so entity correctness rests entirely on
FORCE RLS + the GUC. Migration `0010_catalogs_init.sql:174-178` does force RLS on accounts/classes/items.
**UNVERIFIED — needs live check:** memory `catalogs-rls-ledger-reality-drift` records prod lacking
policies the ledger claims. If prod's policy is absent or not opco-based, these badges blend entities.
Blocker: prod DB access gated. **Cursor's lane — flag only, do not change.**

---

## Proposed blocks (my lane, in order)

| Block | Scope | Gate |
|---|---|---|
| **LST-B1** | Fix LST-F5 + LST-F9 together: replace the `= 3` literal with a real `journal_entry_types` count-spec entry, delete the constant, and **extend `verify-no-hardcoded-list-counts` to scan `lists-module-count-spec.ts`** so the literal cannot return. Selftest must fail on the pre-fix file from `main`. | Backend non-financial + guard → **self-merge on green**; but the counted table is `catalogs.*` → **verify `companyScoped` against prod first (ask)** |
| **LST-B2** | Fix LST-F1: add the omitted catalogs to the count spec (safety ×3, dispatch ×1, drivers ×1, accounting ×3), each with `companyScoped` proven against prod shape; decide services-catalog + names_master/brokers explicitly. | Touches `catalogs.*` reads → **owner OK** |
| **LST-B3** | Fix LST-F2: coverage-parity guard — every `live:true` `DOMAIN_CONFIG` catalog must appear in `LISTS_MODULE_COUNT_SPECS` or an explicit `countedElsewhere` allowlist with a reason. Wired via `verify-steps/`. This is what makes LST-B2 un-regressable. | Guard-only → **self-merge on green** |
| **LST-B4** | Fix LST-F3: add `driver_load_statuses` to `DOMAIN_CONFIG` (drivers domain) + route resolver, so the converted catalog is clickable from the hub. Additive only. | Pure frontend → **self-merge on green** |
| **LST-B5** | Fix LST-F4: drive registry stats/preview from a registry-backed descriptor instead of two hardcoded 8-entry maps; unknown code → explicit `unsupported_catalog_code`, never a silent 0. | Backend non-financial → **self-merge on green** |
| **LST-B6** | Fix LST-F6 + LST-F8: correct the stale per-entity comments in both files; record the 4 `names_master` placeholders in `DEFERRED-ITEMS.md`. | Docs/comments → **self-merge on green** |

**Not in my lane / not proposed:** LST-F12 (accounting RLS scoping) and the 5 global accounting catalogs
— Cursor's. LST-F7 is structural and should be settled as part of the `dispatcher_error_reasons`
conversion (the next remaining item), not as its own refactor.

**Ordering note:** LST-B1 and LST-B3 are the two that stop the bleeding — one removes the live lie, the
other makes the whole class un-regressable. LST-B2 is the largest and needs prod shape verification per
table before a single line is written.
