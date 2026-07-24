# Module completion — N of M (GENERATED — do not hand-edit)

Generated from `docs/trackers/module-completion/*.json` by
`scripts/verify-module-completion.mjs --write`. The manifests are the source of truth;
this file is regenerated and CI fails if it drifts (verify-step 1423).

**N counts ONLY boundaries with `status: "verified"` — a recorded live proof.**
`merged_unverified` means the code shipped but nobody proved it works: it does NOT count.

**Module coverage: 2 of 30 modules have a completion manifest.**
Untracked modules are listed with a reason in `docs/trackers/module-completion/_coverage.json`;
a module that is neither tracked nor exempted fails CI.

| Module | N of M verified | merged, unverified | not started | unmapped | HOLD (owner-gated) |
|---|---|---|---|---|---|
| **lists** | **0 of 14** | 4 | 10 | 0 | 8 |
| **safety** | **0 of 30** | 26 | 4 | 0 | 7 |

## lists — 0 of 14 verified

Audit: `~/Desktop/IH35-CURSOR-AUDIT/modules/lists.md`
Prod settlement: `~/Desktop/IH35-CURSOR-AUDIT/modules/lists-PROD-SETTLEMENT-2026-07-24.md`

| # | Boundary | Findings | HOLD | PRs | Status | Evidence / note |
|---|---|---|---|---|---|---|
| [ ] LST-B01 | Repoint /lists hub ribbon off the QBO remote-count view | F01 | no | — | `not_started` | PROD-SETTLED 2026-07-24: feed is NOT dark (fresh 17:10Z, real values) - structural half stands |
| [ ] LST-B02 | Fleet catalogs per-entity + metadata + code uniqueness | F02, F02b, F07, F24 | **YES** | #3397, #3405, #3387 | `merged_unverified` | PROD-SETTLED: 9/10 fleet catalogs carry operating_company_id + FORCE RLS; tire_positions global by design |
| [ ] LST-B03 | payment_terms / posting_templates / account_role_bindings per-entity | F03 | **YES** | — | `partially_merged_unverified` | PROD-SETTLED: account_role_bindings ALREADY has opco; payment_terms + posting_templates still global |
| [ ] LST-B04 | Cancel-load FK repoint + cancellation-reason consolidation | F04 | **YES** | — | `not_started` | PROD-CONFIRMED P0: load_cancellations.reason_code NOT NULL -> legacy catalog; 36/36 active modern codes violate it |
| [ ] LST-B05 | Kill the lowest-UUID entity hijack in 3 routes | F05 | **YES** | #3389 | `merged_unverified` | — |
| [ ] LST-B06 | WO cost-context repoint to canonical category/item tables | F06, F26 | **YES** | — | `not_started` | — |
| [ ] LST-B07 | Require OCID on /catalogs/accounts | F08 | **YES** | — | `not_started` | — |
| [ ] LST-B08 | account_role_bindings global UNIQUE drop (USMCA blocker) | F09 | **YES** | #3345 | `merged_unverified` | PROD-SETTLED: REFUTED/RESOLVED - uq_account_role_bindings_company_role_key exists, no global unique |
| [ ] LST-B09 | /lists/driver/teams stub: build or archive | F10 | no | — | `not_started` | — |
| [ ] LST-B10 | Brokers catalog: real roster or honest banner | F11 | no | — | `not_started` | — |
| [ ] LST-B11 | Maintenance parts (4-way) + services (2-way) consolidation | F12, F15 | no | — | `not_started` | — |
| [ ] LST-B12 | Hub-unreachable routes into DOMAIN_CONFIG | F13, F18 | no | — | `not_started` | EXTENDED: driver_load_statuses also unreachable (my LST-F3) |
| [ ] LST-B13 | postable_only param on account pickers | F14 | **YES** | — | `not_started` | PROD-SETTLED: exposure is 2 rows fleet-wide (TRANSP 1, TRK 1, USMCA 0) - real but not P0-sized |
| [ ] LST-B14 | Count-spec completion + skipped-table disclosure | F20, F21 | no | — | `not_started` | PROD-QUANTIFIED: understates TRANSP by 548 active rows, TRK/USMCA by 289 each; +13 JE literal |

## safety — 0 of 30 verified

Audit: `~/Desktop/IH35-CURSOR-AUDIT/modules/safety.md`

| # | Boundary | Findings | HOLD | PRs | Status | Evidence / note |
|---|---|---|---|---|---|---|
| [ ] SAF-B01 | Escrow forfeiture endpoint + economics | F01 | **YES** | #3348 | `merged_unverified` | — |
| [ ] SAF-B02 | Apply held migrations for the fine->deduction chain | F02, F03 | **YES** | — | `not_started` | — |
| [ ] SAF-B03 | Apply held migrations for the claim reverse graph | F04 | **YES** | — | `not_started` | — |
| [ ] SAF-B04 | Accident wizard field persistence + validation + widened guard | F05, F30 | no | #3353, #3384 | `merged_unverified` | — |
| [ ] SAF-B05 | Base-less fetch sweep + guard (+2290 honesty) | F06, F32 | no | #3336 | `partially_merged_unverified` | — |
| [ ] SAF-B06 | D&A / RTD block in the driver-qualification gate | F07 | no | #3375 | `merged_unverified` | — |
| [ ] SAF-B07 | Held-column consumer guard | F08 | no | #3384 | `merged_unverified` | — |
| [ ] SAF-B08 | Escrow invented KPI + signed-clause source of truth | F09 | **YES** | #3380 | `merged_unverified` | — |
| [ ] SAF-B09 | Escrow forfeit drawer/pickers/validation | F10 | **YES** | #3381 | `merged_unverified` | — |
| [ ] SAF-B10 | Void-reason governance (DOT inspections, complaints) | F11 | no | #3339 | `merged_unverified` | — |
| [ ] SAF-B11 | Internal-fine lifecycle routes + row actions | F12 | no | #3371 | `merged_unverified` | — |
| [ ] SAF-B12 | External-fine actions wired | F13 | no | — | `not_started` | — |
| [ ] SAF-B13 | DOT/HOS creator pickers | F14 | no | #3340 | `merged_unverified` | — |
| [ ] SAF-B14 | Bind the 3 orphan safety catalogs to their creators | F15 | no | #3376 | `merged_unverified` | — |
| [ ] SAF-B15 | Driver profile: fines / complaints / D&A reverse views | F16 | no | #3363 | `merged_unverified` | — |
| [ ] SAF-B16 | Unit + trailer profile safety reverse section | F17 | no | #3365 | `merged_unverified` | — |
| [ ] SAF-B17 | External fines driver column + detail driver link | F18 | no | #3354 | `merged_unverified` | — |
| [ ] SAF-B18 | External fine load / unit / document capture | F19 | no | #3376 | `merged_unverified` | — |
| [ ] SAF-B19 | Incidents cluster edit + status lifecycle + void | F20 | no | #3377 | `merged_unverified` | — |
| [ ] SAF-B20 | Cargo claims ParityTable + links | F21 | no | #3379 | `merged_unverified` | — |
| [ ] SAF-B21 | Orphan-route nav entry points | F22, F23, F35 | no | #3370 | `merged_unverified` | — |
| [ ] SAF-B22 | Escrow tab drill-through (driver/settlement/GL/bank) | F23 | **YES** | #3370 | `merged_unverified` | — |
| [ ] SAF-B23 | Internal-fine inline + Add new reason | F24 | no | #3360 | `merged_unverified` | — |
| [ ] SAF-B24 | ParityDrawer migration (3 surfaces) | F25 | no | #3381 | `merged_unverified` | — |
| [ ] SAF-B25 | Accidents list name resolution + pickers | F26 | no | #3356 | `merged_unverified` | — |
| [ ] SAF-B26 | De-duplicate the 7 double-registered routes + guard | F27 | no | — | `not_started` | — |
| [ ] SAF-B27 | Docs drift: docs/CLAUDE.md section 7 -> 28/9 | F28 | no | #3384 | `merged_unverified` | — |
| [ ] SAF-B28 | company_violations JSONB -> real FKs (migration) | F29 | **YES** | #3380 | `merged_unverified` | — |
| [ ] SAF-B29 | Server-side type-ahead for the 200-cap pickers | F31 | no | #3379 | `merged_unverified` | — |
| [ ] SAF-B30 | EntityLink safety kinds + safety detail routes | F33, F35 | no | #3357, #3370 | `merged_unverified` | — |

