# GUARD — held-registry ↔ live-ledger cross-check (prod-verified, 2026-07-25)

**Scope:** independently confirm Claude Coder's "79 of 110 held migrations applied-but-flagged-unapplied" finding, and settle the SAF-F02/F04 + ACCT-F02 premises against the LIVE ledgers — not migration files, not the registry.
**Evidence source (Rule 10):** Neon prod `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`, `catalogs.*` read under `set_config('app.bypass_rls','lucia',true)`. Registry read from `db/migrations/.held-migrations.json` @ `refs/heads/main` (sha `eeaca12`). All counts below are live.

---

## 1. Headline numbers (all prod-verified)

| fact | value | source |
|---|---|---|
| `.held-migrations.json` entries | **120** | registry `main` |
| … unique files | **111** | registry (→ 9 duplicate entries) |
| `_system._schema_migrations` rows | **727** (max `202607950000`) | live |
| `ih35_migrations.applied_migrations` rows | **724** (max `202607950000`) | live |
| held files **already applied** on prod (in `_system`) | **99 of 111** | `comm -12` held ∩ sys |
| held files already applied (in `ih35` ledger) | **97 of 111** | held ∩ ih35 |
| held files **genuinely unapplied** (in NEITHER ledger) | **12** | held − sys − ih35 |
| dual-ledger drift (`_system` has, `ih35` missing) | **3** | sys − ih35 |

**Coder's finding is CONFIRMED and larger than estimated.** The true figure is **99 of 111** held files already live on prod by the `_system` ledger (97 by `ih35`), not 79/110. The registry carries no `applied` flag — it is a *marker-mirror* (files bearing a `DO-NOT-RUN-ON-PROD` header), never an applied-state tracker — so any status/planning consumer that reads "listed in held = still pending" mis-reports up to **99** already-applied migrations. **That is the root cause of the SAF-F02/F04 false premise.**

---

## 2. Confirmed downstream defects (settled against the ledger)

**2a. SAF-F02 / SAF-F04 premise is FALSE — the cited migration is APPLIED.**
`202607080000_settlement_contract_terms.sql` is present in **BOTH** ledgers (applied) yet still sits in the held registry. Its schema objects are live on prod (columns previously verified in the Safety corrections doc). The blocks' "supersede a held/unapplied column" premise does not hold — the real work is Rule-21 both-way READ verification of the already-live FKs, anchored on `information_schema` (Rule 06 false-empty), never on the corrupt registry.

**2b. ACCT-F02 "island closed by 202607960000" is FALSE — that migration is genuinely UNAPPLIED.**
`202607960000_journal_entries_type_fk.sql` is in **NEITHER** ledger (truly held), and prod `accounting.journal_entries` has **no** `type` and **no** `journal_entry_type_id` column. The journal-entry-type FK island is **OPEN**, not closed. `#3440` merged ≠ applied. ACCT-F02 must be corrected: the type-FK is HELD-for-owner, not live.

**2c. Expense-line → expense-category FK genuinely unapplied.**
`202608020000_acct_link_04_expense_lines_expense_category_fk.sql` is in neither ledger; prod `expense_lines` has no `expense_category_id`. This is why `expense_categories` shows 0 inbound FKs. Held-for-owner, not a wiring defect to "fix in code."

**2d. LATENT integrity gap — `catalogs.account_role_bindings` role uniqueness.**
`202607770000_drop_account_role_bindings_global_unique.sql` is **applied** (`_system` ledger; live-verified: the table now has only `account_role_bindings_pkey PRIMARY KEY (id)` — no business-key unique). Its per-entity replacement `202607990000_account_role_bindings_entity_scope_finish.sql` is **genuinely unapplied** (neither ledger). The table is currently **EMPTY (0 rows)** — so there is **no active bad data** — but there is presently **no DB-level guard** against duplicate `(operating_company_id, role_key)` bindings. **Recommendation (Rule 19-adjacent):** the owner must apply `202607990000` on Neon **before** designating any role→account bindings via CoaRolesPage, or the first designations could create ambiguous role resolution with nothing at the database level to stop it.

---

## 3. The 12 genuinely-unapplied held files (the true remaining HELD-for-owner work)

```
202607690000_bank_tx_capture_fields.sql
202607760000_cash_dip_coa_role.sql
202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql
202607840000_revoke_delete_safety_join_tables.sql        (SAF-F29 — revoke DELETE on safety junctions)
202607950000_posting_batches_template_link.sql
202607960000_journal_entries_type_fk.sql                 (ACCT-F02 — OPEN, see 2b)
202607990000_account_role_bindings_entity_scope_finish.sql (see 2d)
202608000000_payment_terms_posting_templates_per_entity.sql
202608010000_dispatcher_error_reasons_per_entity.sql
202608020000_acct_link_04_expense_lines_expense_category_fk.sql (see 2c)
202608030000_bank_accounts_rls_bypass_lucia.sql
202608040000_payment_terms_consumer_remap_same_entity.sql
```
These are the only files that should remain in the registry's active `held` set. Everything else in the list is already on prod.

## 4. The 9 duplicate registry entries (hygiene defect)
```
202606272300_deduction_line_load_id_direct.sql
202607070100_bank_categorize_unit_trip_driver_deduction.sql
202607080000_settlement_contract_terms.sql
202607110200_civil_fines_voidable.sql
202607240000_incidents_auto_claim_fk.sql
202607250000_phase4_crossmodule_fks.sql
202607810000_accident_reports_capture_fields.sql
202607820000_safety_relational_linkage_and_lifecycle.sql
202607830000_escrow_target_settings.sql
```
Each appears twice in `.held` (120 entries, 111 unique). `verify:hold-migrations-registered` parity can behave unpredictably with doubled keys, and any consumer iterating `.held` double-counts.

## 5. Dual-ledger drift — 3 rows in `_system` but not `ih35_migrations`
```
202607610000_qbo_connections_rls_bypass_escape.sql
202607770000_drop_account_role_bindings_global_unique.sql   (live-verified applied — unique is gone)
202607780000_bank_account_cash_gl_postable_trigger.sql      (live-verified applied — trigger is live)
```
`_system._schema_migrations` is the more-complete ledger: two of the three were confirmed applied by their live objects (a postable trigger present; the global-unique absent). `ih35_migrations.applied_migrations` is missing these 3 backfill rows. The both-ledger backfill ceremony must write **both** ledgers; it left `ih35` 3 short.

---

## 6. ROOT CAUSE / FIX / GUARD / LIVE PROOF / REMAINING (Rule 16)

- **ROOT CAUSE:** `.held-migrations.json` is a DO-NOT-RUN marker-mirror, not an applied-state tracker. The HELD ceremony applies + ledger-backfills but never de-lists the applied file, so 99/111 entries are stale-"held". Consumers reading the registry as "pending" produced the SAF-F02/F04 and ACCT-F02 false premises.
- **FIX (single owner-reviewed governance PR, Rule 18 §9; additive, Rule 07 — delete no files):**
  1. De-duplicate the 9 doubled `.held` entries.
  2. Reconcile `ih35_migrations.applied_migrations` to `_system._schema_migrations` — backfill the 3 missing rows (owner Neon-apply; GUARD re-proves parity = 0 drift).
  3. Split registry semantics: any `.held` file also present in `_system._schema_migrations` is **applied** → move to an `applied_held` section (or drop only its DO-NOT-RUN header, never the file), leaving exactly the **12** genuinely-unapplied files in `held`. Update `verify:hold-migrations-registered` to reflect the two states.
- **GUARD:** add `scripts/verify-steps/NNN-held-registry-ledger-parity.mjs` (Rule 17 — verify-steps only, never edit ci.yml/package.json) that fails closed when (a) any `held` file appears in `_system._schema_migrations`, or (b) `_system` and `ih35_migrations` disagree. This is the guard that would have caught the SAF/ACCT false premises at CI.
- **LIVE PROOF:** every count in §1–§5 read from prod under lucia on 2026-07-25; drift files confirmed by live objects (trigger present, unique absent); ACCT-F02 confirmed by absent `journal_entries.type`; role-binding gap confirmed by `pg_constraint` (PK-only) + 0 rows.
- **REMAINING (owner decisions — Rule 13/19):** ordering + Neon-apply of the 12 genuinely-held migrations, in particular `202607960000` (journal-entry type FK — reopens ACCT-F02) and `202607990000` (apply **before** any CoaRolesPage role designation). These are HELD-for-Jorge; no agent applies them.
