# SOURCE-OF-TRUTH MAP — READ lookalikes (owner 2026-08-28)

**Companion:** `docs/lockdown/FINDING-SOURCE-OF-TRUTH-BLOCK-LAW-2026-08-28.md`  
**Write RETIRE law** still forbids writing RETIRE tables. This map is for **READS** — querying the wrong twin produces a false finding (empty, wrong balance, wrong role).

Extend this table when a new ambiguous pair burns a seat. Do not invent a second map.

| Question | CANONICAL (code reads this) | LOOKALIKE (trap) | Why the lookalike exists |
|---|---|---|---|
| role → account | `accounting.chart_of_accounts_roles` (PRIMARY; `coa-roles/resolver.service.ts`) | `catalogs.account_role_bindings` (LEGACY FALLBACK; prod **0 rows**) | Rule 07 never-delete. Resolver still falls back to bindings when PRIMARY is absent. Bindings are **not dead** (routes, migrations, verify scripts). They are **empty by design** after roles moved to PRIMARY. Do **not** DELETE the table. A finding that “roles are unbound” from a 0-count on bindings is UNVERIFIED. |
| USMCA A/R (or any GL) balance | GL / report path **excluding** `is_sample_data` (post #16832: TB/P&L/BS/CF/register) | Raw `accounting.journal_entry_postings` **or** AP/AR aging / vendor balances / collections **without** the sample predicate | Sample TESTs are kept until launch. Statements exclude them. **Aging + vendor balances + collections still mix bases** (no `is_sample_data` filter as of 2026-08-28) — that is a real report defect, not a 1099 defect. Mixing bases invents stranded dollars. |
| “vertical” (launch plan) | Fix horizontally once; verify along the money path (`docs/lockdown/CURSOR-VERIFY-MASTER-LAUNCH-PLAN-2026-08-28.md`) | Retired “vertical close” = stamp a module CERTIFIED | Word drift. Three older defs. Prefer the locked launch-plan meaning. |
| withholding / 1099 / 1042-S | `docs/lockdown/OWNER-DECISIONS-FINAL-2026-07-26.md` **E1** | `docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md` BLOCK-17/24 · `docs/specs/1099-and-tax-doc-BLOCK-17-DESIGN.md` · `docs/trackers/NEEDS-OWNER-ADJUDICATION-2026-07-21.md` item 1 · `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` “1099 / W-8BEN” | 07-05 said 1099-NEC + open CPA question. **E1 (07-26) supersedes:** no withholding, no 1042-S/1099. BLOCK-24 is PENDING/GATED — not a filing surface. |
| opening / cutover dates | `docs/lockdown/00_LOCKED_DECISIONS.md` **§8.9** (OB 03/31/2026 · live 04/01/2026) | 07-05 ENTERPRISE “opens 01-01-2025 / BS 12/31/2024” | Later Ch.11 fresh-start line. |
| merge / Neon / CPA gate | OWNER LAW 2026-08-03 + `OPERATING-FACT-no-CPA-owner-decides` | OWNER-DECISIONS-FINAL **H2** “Devin merges”; any “ask Jorge/CPA” | Merge mechanics reversed; tax questions closed by owner, not a CPA. |
| Event 2 A/R gate | Option **B**: delivery evidence + issued invoice (`docs/lockdown/OWNER-DECISION-ACCT-F5692-OPTION-B-2026-08-27.md`) | POD-required Event 2 / seeding `dispatch.pod_documents` to “prove” A/R | Owner typed B. POD stays on factoring. |
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

## Doc supersession (same class)

Any `docs/LOCKED-DECISIONS-*` or `docs/lockdown/*` file **without** a SUPERSEDED-BY line for a later reversal still reads as current. Agents must not grep the oldest hit.

| Older live text | Later winner | Marker location |
|---|---|---|
| 07-05 ENTERPRISE 1099-NEC + Jorge/CPA 30% question | OWNER-DECISIONS-FINAL **E1** | Header + struck BLOCK-17/24 bullet on the 07-05 file |
| 07-05 ENTERPRISE open date 01-01-2025 | `00_LOCKED_DECISIONS.md` §8.9 | Header + OPENING section on the 07-05 file |
| OWNER-DECISIONS-FINAL H2 Devin merges | OWNER LAW 2026-08-03 | Header on OWNER-DECISIONS-FINAL |
| Two role tables | `chart_of_accounts_roles` PRIMARY | This map, row 1 |
| Three “vertical” defs | Launch-plan meaning | This map |
| Two A/R bases (sample vs real) | Real-only on statements; aging still mixed until CC-1 | This map, row 2 |
