# CODEX — Transaction Health Register: Band E + reference parity

**Date:** 2026-09-01  
**Law:** `docs/bus/LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01.md` (`927825a`)  
**Scope:** source/schema-contract audit plus fresh primary-source parity research. No production financial write, database mutation, health wiring, migration, or money action.

## Honest baseline

The adoption baseline remains **2 PASSING · 13 FAILING · 24 NEVER RUN**. This pass does not convert any NEVER RUN check to PASS: no authenticated per-entity production execution was available in this worktree, and three Band-E predicates are not yet executable without missing registry inputs.

## Band E grade

| Check | Verdict | What is proved now | Required remediation before health wiring |
|---|---|---|---|
| E1 · postings on one JE share one entity | **NEVER RUN · buildable** | The canonical join is `accounting.journal_entry_postings.journal_entry_uuid → accounting.journal_entries.id`; both rows carry `operating_company_id`. Historical audit prose reports zero mismatches, but that is not a current run and earns no adoption credit. | Per active entity, count postings where posting opco differs from its JE opco. Return entity, count, sample JE/posting IDs, and exact remediation: quarantine the JE, reverse through the authorized path, repair the writer, then rerun. Zero only passes. |
| E2 · no document references a parent in another entity | **GAP → BLOCK** | The predicate's universe is not declared. “Document” and “parent” are not a machine-readable edge registry; a few hand-picked joins could falsely pass while an omitted edge leaks. Cascade is assigned the Band-E enumeration. | Build one canonical document→parent edge registry from `pg_constraint` plus explicitly registered soft references. Each edge names child table/column, parent table/column, entity columns, applicability predicate, and remediation owner. Run every edge per entity; missing/unexecuted edges remain NEVER RUN. |
| E3 · every financial row has non-null opco | **GAP → BLOCK** | The predicate's table universe is not declared. Scanning a convenient subset is not “every financial row”; scanning whole schemas without classifications produces false failures on legitimate global/control tables. | Create a canonical financial-table registry classifying transaction, line, junction, control, and explicitly-global tables. For every non-global row-bearing table require an opco column and count nulls per table/entity. A missing column is itself a failing result. Registry completeness must be workflow-guarded. |
| E4 · TRANSP/TRK frozen, zero new financial rows | **GAP → BLOCK** | The law names the frozen entities but does not define `frozen_since`, the baseline snapshot, included tables, or whether corrective reversals are counted separately. Without those, “new” is not reproducible. | Owner/lead records an immutable freeze epoch and baseline per registered financial table. Detector resolves entities by canonical code/ID, never legal-name inference, and reports post-epoch inserts separately as ordinary writes versus authorized reversals/corrections. Any ordinary post-freeze row is critical; remediation names the writer/path and reversal policy. |

### Entity-safety constraints retained

- Resolve TRANSP/TRK/USMCA by canonical company identity, never name-string inference or hard-coded tracked UUIDs.
- Owner sessions are not protected by RLS alone; every detector query carries its own entity predicate.
- Units use `owner_company_id` / `currently_leased_to_company_id`, not a nonexistent `mdata.units.operating_company_id`.
- E2 must use `pg_constraint` for FK truth. `information_schema` three-way joins are forbidden for constraint-existence claims.
- Per-entity output is mandatory. An aggregate zero that can cancel or hide an entity failure is not a pass.

## Register-level compliance gaps against its own law

### `GAP → BLOCK` — checks do not name remediation in the canonical table

The law requires every check to name remediation, but the 39-row canonical register contains no remediation column or per-check remediation text. Band ownership is not remediation: it does not tell an operator what record/path to correct after a red result.

**Block:** extend the machine-readable check registry—not ad hoc health response prose—with `remediation`, `owner`, `mode` (`shadow|blocking`), baseline count, entity, last-run time, and workflow/guard identity. Health must expose a bounded remediation code while logs/operator detail retain the actionable text.

### `GAP → BLOCK` — no execution identity for 24 NEVER RUN checks

The register lists intended checks, not executable registrations. It does not bind each check to an implementation, workflow, last-run result, or evidence artifact. Therefore “nothing is missed” remains unclaimable.

**Block:** a closed-loop registry must fail when a law row lacks implementation, workflow, selftest/guard, remediation, per-entity result, or last-run evidence. NEVER RUN is a first-class state and may not collapse to PASS/zero.

## Fresh reference parity

### QuickBooks Online

#### `GAP → BLOCK` — IH35 lacks reconciliation-after-close mutation detection

QuickBooks requires the reconciliation ending difference to reach zero. If a prior beginning balance changes, its Reconcile Discrepancy Report identifies what changed, how it affected the balance, and who changed it through audit history. Its audit log also records transaction edits and completed-reconciliation changes.

IH35 covers current bank/subledger variances and voided-document matches, but misses a first-class **post-reconciliation mutation detector**: a previously reconciled transaction/session changed, unreconciled, deleted/voided, or moved after close.

**Parity block `TXH-RECON-AFTER-CLOSE-MUTATION`:** per entity and reconciliation session, snapshot the reconciled membership/balance and alert on later membership, amount, date, account, void, or status changes. Remediation: reopen/adjust only through the authorized logged path, restore the statement tie, and retain before/after actor evidence.

Sources:

- [Fix beginning-balance issues when reconciling](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/fix-issues-accounts-reconciled-past-quickbooks/L8lx6PQQ5_US_en_US)
- [Use the QuickBooks Online audit log](https://quickbooks.intuit.com/learn-support/en-us/help-article/audit-log/use-audit-log-quickbooks-online/L2WoVnW6I_US_en_US)
- [Missing reconciliation reports or reconciled transactions](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/view-details-missing-reconciliation-reports/L2C82hF5l_US_en_US)

### NetSuite

#### `GAP → BLOCK` — period-close checklist coverage is materially broader

NetSuite's period-close process includes controls the 39-check register does not name:

- transaction-date/posting-period mismatches;
- negative inventory, inventory quantity/detail mismatches, inventory costing, and inventory activity;
- foreign-currency revaluation and consolidated exchange-rate calculation;
- intercompany adjustments and eliminations with drillable elimination journals;
- failed/pending asynchronous Custom GL Lines executions;
- gapless GL audit numbering, per subsidiary/book, with immutable impact/reversal behavior when locking is enabled;
- ordered task dependencies and auditable completion state per accounting book.

**Parity blocks:**

1. `TXH-PERIOD-DATE-MISMATCH` — zero transactions whose business date conflicts with posting period without an authorized exception; remediation is redate/repost through the permissioned correction path.
2. `TXH-GL-SEQUENCE-GAPS` — gapless immutable sequence for every GL-impacting transaction, including void/reversal; remediation identifies the missing/renumbered transaction and preserves reversal history.
3. `TXH-INTERCOMPANY-ELIMINATION` — reciprocal intercompany balances, elimination eligibility, elimination JE completeness, and pair-to-zero by period/entity; remediation creates/repairs the paired elimination through the canonical engine.
4. `TXH-INVENTORY-CLOSE` — negative inventory, quantity-detail mismatch, costing not complete, and activity after close; remediation names the unit/item/location and authorized adjustment path.
5. `TXH-FX-CLOSE` — overdue/missing revaluation and consolidated-rate calculation where foreign currency is enabled; remediation runs the governed close task and records its output.
6. `TXH-ASYNC-POSTING-FAILURES` — failed, deferred, retrying, or never-completed asynchronous posting extensions/jobs; remediation identifies the job and safe replay path.

Sources:

- [NetSuite Accounting Period Close](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1452509.html)
- [Using the Period Close Checklist](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1455781.html)
- [Inventory Tasks on the Period Close Checklist](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1456591.html)
- [GL Audit Numbering](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_3735573963.html)
- [Viewing Intercompany Elimination Results](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/bridgehead_N1501917.html)

### McLeod LoadMaster

#### `GAP → BLOCK` — broader transaction-health parity is not evidenced publicly

McLeod's official public API states that application APIs enforce authentication, auditing, permissions, and validation, and its Settlement API requires an explicit `X-com.mcleodsoftware.CompanyID`. That supports IH35's per-entity and actor-trace requirements. Public material reviewed does **not** document a 39-check GL/subledger/void/linkage health suite or its period-close control catalog, so no broader parity credit is awarded.

**Block:** obtain a licensed LoadMaster accounting/period-close manual or an owner-authorized live walkthrough before claiming McLeod parity. Company-ID headers and audit claims do not prove cross-module transaction integrity.

Sources:

- [McLeod API documentation home](https://tms-dsly.loadtracking.com/ws/docs/home?role=-1)
- [McLeod Settlement API](https://tms-dsly.loadtracking.com/ws/docs/services?operation=getSettlements&role=-1&service=SettlementService)

## Ranked conclusion

1. **P0:** E2/E3/E4 are not fully executable specifications yet; partial implementations would create false-green entity safety.
2. **P0:** add reconciliation-after-close mutation detection; current balance-only checks can miss a changed previously reconciled record.
3. **P1:** add date/period mismatch, intercompany elimination, and gapless GL-impact sequence controls.
4. **P1/P2 by feature enablement:** inventory close, FX close, and asynchronous posting completion.
5. **Evidence limitation:** McLeod transaction-health parity remains unverified from public official documentation.

No financial records were created, modified, voided, posted, matched, or reconciled in this audit.
