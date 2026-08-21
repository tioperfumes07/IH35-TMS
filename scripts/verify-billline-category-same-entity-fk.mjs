#!/usr/bin/env node
/**
 * CLS-BILLLINE-CATEGORY-NO-FK / ACCT-F5686 — accounting.bill_lines.expense_category_uuid had NO
 * foreign key at all (only bill_lines_account_id_fkey/_load_id_fkey/_parent_line_uuid_fkey
 * existed), and was already caught live holding a GL ACCOUNT id (not a real category) on 5
 * prod rows — the write-path half of this defect was already fixed under ACCT-F194 (bill lines
 * now write NULL, never an account id, when no category resolves), but nothing at the SCHEMA
 * level stopped a future writer from reintroducing the exact same defect.
 *
 * Fixed by 202612890000_acct_f5686_bill_lines_expense_category_same_entity_fk.sql, mirroring the
 * already-shipped sibling migration for accounting.expense_lines (ACCT-LINK-04) exactly: adds
 * accounting.bill_lines.operating_company_id (derived from the parent bill via a BEFORE trigger,
 * so no writer can leave it NULL or disagree with its header), then a composite same-entity FK
 * from (operating_company_id, expense_category_uuid) to catalogs.expense_categories
 * (operating_company_id, id) — MATCH SIMPLE, so an uncategorized line stays legal but a
 * categorized line must point at a category belonging to the SAME entity as its own bill. The
 * migration's own §0 repairs (WORM-honest, dynamic detection, not delete) the known-orphaned
 * rows before adding the FK, since an FK cannot be added over violating data.
 *
 * This guard locks: (1) the migration file exists with the repair step BEFORE the FK addition,
 * (2) the composite FK targets catalogs.expense_categories on (operating_company_id, id) — not a
 * bare single-column FK, which would allow a cross-entity category, (3) the derive-trigger
 * pattern is present so operating_company_id can never silently disagree with the parent bill.
 *
 * Static-only: no DB connection. Live proof (rehearsal on a disposable Neon branch, then applied
 * to prod: 0 orphans remaining, 0 NULL operating_company_id across 155,000+ rows, FK present,
 * cross-entity insert rejected, same-entity insert + trigger-derived entity succeeds, idempotent
 * on re-run) is documented in the PR body, not re-run here.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const migrationPath = "db/migrations/202612890000_acct_f5686_bill_lines_expense_category_same_entity_fk.sql";

function analyze() {
  const failures = [];

  if (!existsSync(migrationPath)) {
    failures.push(`${migrationPath}: file not found`);
    return failures;
  }
  const src = readFileSync(migrationPath, "utf8");

  const repairIdx = src.indexOf("-- §0");
  const fkIdx = src.indexOf("bill_lines_expense_category_same_entity_fkey");
  if (repairIdx === -1) {
    failures.push(`${migrationPath}: §0 orphan-repair step not found`);
  } else if (fkIdx === -1) {
    failures.push(`${migrationPath}: bill_lines_expense_category_same_entity_fkey not found at all`);
  } else if (repairIdx > fkIdx) {
    failures.push(`${migrationPath}: §0 repair runs AFTER the FK addition — the FK would fail on the very orphans it needs repaired first`);
  }

  if (!/SET expense_category_uuid = NULL/.test(src)) {
    failures.push(`${migrationPath}: repair step does not set the orphaned pointer to NULL (matching the already-fixed write path's own behavior)`);
  }
  // Must be a dynamic, same-entity orphan detection — never a hardcoded id list (which would miss
  // any future orphan the write-path fix didn't anticipate).
  if (!/NOT EXISTS \(\s*SELECT 1 FROM catalogs\.expense_categories ec\s*WHERE ec\.id = bl\.expense_category_uuid\s*AND ec\.operating_company_id = b\.operating_company_id\s*\)/.test(src)) {
    failures.push(`${migrationPath}: §0 repair is not a dynamic same-entity orphan detection`);
  }

  if (!/FOREIGN KEY \(operating_company_id, expense_category_uuid\)\s*\n\s*REFERENCES catalogs\.expense_categories \(operating_company_id, id\)/.test(src)) {
    failures.push(`${migrationPath}: the FK is not a composite (operating_company_id, expense_category_uuid) same-entity FK — a bare single-column FK would allow a cross-entity category`);
  }

  if (!/CREATE OR REPLACE FUNCTION accounting\.bill_lines_derive_company\(\)/.test(src)) {
    failures.push(`${migrationPath}: the derive-from-parent-bill trigger function is missing — operating_company_id could then be set incorrectly by a writer that doesn't know about it`);
  }
  if (!/BEFORE INSERT OR UPDATE OF bill_id, operating_company_id ON accounting\.bill_lines/.test(src)) {
    failures.push(`${migrationPath}: the derive trigger is not wired as BEFORE INSERT OR UPDATE on bill_lines`);
  }

  return failures;
}

function selftest() {
  const good = analyze();
  if (good.length > 0) {
    console.error("verify-billline-category-same-entity-fk --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const src = readFileSync(migrationPath, "utf8");

  // Mutation 1: drop the §0 repair step entirely (the FK addition would then fail loud on real
  // orphaned data — a regression that would block every future bill_lines write once the guard
  // for the orphan check trips, or worse, silently succeed if data happened to be clean at apply
  // time and then break the NEXT bill_lines write that reintroduces an orphan).
  const mutated1 = src.replace(
    /-- §0[\s\S]*?RAISE NOTICE 'ACCT-F5686: §0 repaired % orphaned bill_lines\.expense_category_uuid row\(s\) to NULL', v_repaired;\nEND\n\$\$;\n\n/,
    ""
  );
  if (mutated1 === src) {
    console.error("verify-billline-category-same-entity-fk --selftest: mutation 1 setup failed — anchor not found");
    process.exit(1);
  }
  writeAndCheck(mutated1, "mutation 1 (drop §0 repair step entirely)");

  // Mutation 2: weaken the FK to a bare single-column reference (allows cross-entity categories).
  const mutated2 = src.replace(
    "FOREIGN KEY (operating_company_id, expense_category_uuid)\n      REFERENCES catalogs.expense_categories (operating_company_id, id);",
    "FOREIGN KEY (expense_category_uuid)\n      REFERENCES catalogs.expense_categories (id);"
  );
  if (mutated2 === src) {
    console.error("verify-billline-category-same-entity-fk --selftest: mutation 2 setup failed — anchor not found");
    process.exit(1);
  }
  writeAndCheck(mutated2, "mutation 2 (weaken to a bare single-column FK)");

  console.log("verify-billline-category-same-entity-fk --selftest: OK (good file clean, both targeted mutations caught)");
}

function writeAndCheck(mutatedSrc, label) {
  const backup = readFileSync(migrationPath, "utf8");
  writeFileSync(migrationPath, mutatedSrc);
  const failures = analyze();
  writeFileSync(migrationPath, backup);
  if (failures.length === 0) {
    console.error(`verify-billline-category-same-entity-fk --selftest: ${label} was not caught`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze();
  if (failures.length > 0) {
    console.error("verify-billline-category-same-entity-fk: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-billline-category-same-entity-fk: OK — orphan repair runs before the same-entity composite FK, derive-trigger present");
}
