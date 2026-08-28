# SOURCE-OF-TRUTH MAP — READ lookalikes (owner 2026-08-28)

**Companion:** `docs/lockdown/FINDING-SOURCE-OF-TRUTH-BLOCK-LAW-2026-08-28.md`  
**Write RETIRE law** still forbids writing RETIRE tables. This map is for **READS** — querying the wrong twin produces a false finding (empty, wrong balance, wrong role).

Extend this table when a new ambiguous pair burns a seat. Do not invent a second map.

| Question | CANONICAL (code reads this) | LOOKALIKE (trap) | Why the lookalike exists |
|---|---|---|---|
| role → account | `accounting.chart_of_accounts_roles` (PRIMARY; `coa-roles/resolver.service.ts`) | `catalogs.account_role_bindings` (LEGACY FALLBACK; prod **0 rows**) | Rule 07 never-delete. Resolver still falls back to bindings when PRIMARY is absent. Bindings are **not dead** (routes, migrations, verify scripts). They are **empty by design** after roles moved to PRIMARY. Do **not** DELETE the table. A finding that “roles are unbound” from a 0-count on bindings is UNVERIFIED. |
| USMCA A/R (or any GL) balance | GL / report path **excluding** `is_sample_data` (post #16832) | Raw `accounting.journal_entry_postings` with sample rows included | Sample TESTs are kept until launch. Statements exclude them. Mixing bases invents stranded dollars. |
| “vertical” (launch plan) | Fix horizontally once; verify along the money path | Retired definitions of “vertical close” as a module stamp | Word drift. Prefer the locked launch-plan meaning. |
| vendor master | `mdata.vendors` | `mdata.qbo_vendors` (RETIRE / QBO mirror) | Mirror sync history. Writers must not target RETIRE; readers of “our vendors” use `mdata.vendors`. |
| driver finance | `driver_finance.*` | `payroll.*` / `settlement.*` (RETIRE) | Schema rename. Same class as write RETIRE, for reads. |
| bank tables | `banking.*` | `bank.*` (RETIRE) | Schema rename. |
| QBO mirror accounting | `mdata.qbo_*` | `accounting.qbo_*` (RETIRE) | Schema rename. |
| maintenance | `maintenance.*` | `maint.*` (RETIRE) | Schema rename. |
| cancellation reasons | `catalogs.cancellation_reasons` | ad-hoc string / wrong catalog | Canonical list. |
| units | `mdata.units` (`owner_company_id` / lease) | inventing `operating_company_id` / `display_id` on units | Units are not opco-scoped the way loads are. |

## How to use

1. Open the **code path** that answers the question (poster, resolver, report SQL).
2. Name that table/file on `SOURCE-OF-TRUTH:`.
3. Query **that** thing (or an equivalent proven to be the same read) on `I QUERIED:`.
4. List blast radius on `NOT CHECKED:`.

If step 2 and step 3 name different twins from this table, the claim is **UNVERIFIED**, not a finding.
