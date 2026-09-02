#!/usr/bin/env node
/**
 * GO-19-09 — accounting.expenses gains class_id (QBO Class dimension), mirroring
 * accounting.bills.class_id, as a full vertical slice: Data (migration 202613370001) / Backend
 * (expenses.routes.ts schema + columnExists-gated INSERT) / Interface (createExpense API type,
 * RecordExpenseForm.tsx picker, recordExpenseSubmit.ts forwarding) / Posting (posting-engine.service.ts
 * propagates class_id from the source bill/expense onto DEBIT lines only, never the credit/balancing
 * line — so a per-class variance report's SUM(debit - credit) doesn't net to zero).
 *
 * Self-test: node scripts/verify-expense-class-id-parity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-class-id-parity";

const CHECKS = [
  {
    name: "backend: createExpenseBodySchema accepts class_id",
    file: "apps/backend/src/accounting/expenses.routes.ts",
    pattern: /class_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/,
  },
  {
    name: "backend: expenses INSERT is columnExists-gated on class_id",
    file: "apps/backend/src/accounting/expenses.routes.ts",
    pattern: /columnExists\(client,\s*"accounting",\s*"expenses",\s*"class_id"\)/,
  },
  {
    name: "backend: expenses INSERT pushes class_id column+value together",
    file: "apps/backend/src/accounting/expenses.routes.ts",
    pattern: /hasClassId[\s\S]{0,120}?columns\.push\(`class_id`\)[\s\S]{0,120}?values\.push\(body\.class_id \?\? null\)/,
  },
  {
    name: "frontend: createExpense API type carries class_id",
    file: "apps/frontend/src/api/accounting.ts",
    pattern: /class_id\?:\s*string/,
  },
  {
    name: "frontend: RecordExpenseForm renders the Class ReferenceSelect",
    file: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
    pattern: /createKind="class"/,
  },
  {
    name: "frontend: RecordExpenseForm queries the classes catalog",
    file: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
    pattern: /classesCatalogClient\.list/,
  },
  {
    name: "frontend: recordExpenseSubmit forwards class_id",
    file: "apps/frontend/src/components/expenses/recordExpenseSubmit.ts",
    pattern: /values\.classId && UUID_RE\.test\(values\.classId\)[\s\S]{0,20}\{\s*class_id:\s*values\.classId\s*\}/,
  },
  {
    name: "frontend: RecordExpenseFormValues carries classId/classLabel",
    file: "apps/frontend/src/components/expenses/recordExpenseSubmit.ts",
    pattern: /classId:\s*string;\s*\n\s*classLabel:\s*string;/,
  },
  {
    name: "posting: PostingLineDraft carries an optional class_id",
    file: "apps/backend/src/accounting/posting-engine.service.ts",
    pattern: /class_id\?:\s*string \| null/,
  },
  {
    name: "posting: insertPostingLines writes class_id into journal_entry_postings",
    file: "apps/backend/src/accounting/posting-engine.service.ts",
    pattern: /class_id,[\s\S]{0,600}line\.class_id \?\? null/,
  },
  {
    name: "posting: buildBillLines propagates bill.class_id onto debit lines",
    file: "apps/backend/src/accounting/posting-engine.service.ts",
    pattern: /class_id:\s*bill\.class_id/,
  },
  {
    name: "posting: buildExpenseLines propagates exp.class_id onto debit lines",
    file: "apps/backend/src/accounting/posting-engine.service.ts",
    pattern: /class_id:\s*exp\.class_id/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/backend/src/accounting/expenses.routes.ts": `
      class_id: z.string().uuid().optional().nullable(),
      const hasClassId = await columnExists(client, "accounting", "expenses", "class_id");
      if (hasClassId) {
        columns.push(\`class_id\`);
        values.push(body.class_id ?? null);
      }
    `,
    "apps/frontend/src/api/accounting.ts": "class_id?: string;",
    "apps/frontend/src/components/expenses/RecordExpenseForm.tsx": `
      classesCatalogClient.list
      createKind="class"
    `,
    "apps/frontend/src/components/expenses/recordExpenseSubmit.ts": `
      classId: string;
      classLabel: string;
      ...(values.classId && UUID_RE.test(values.classId) ? { class_id: values.classId } : {}),
    `,
    "apps/backend/src/accounting/posting-engine.service.ts": `
      class_id?: string | null;
      class_id,
      line.class_id ?? null
      class_id: bill.class_id,
      class_id: exp.class_id,
    `,
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — expense class_id parity with bills (Data/Backend/Interface/Posting) all present`);
