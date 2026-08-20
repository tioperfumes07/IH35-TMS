#!/usr/bin/env node
/**
 * WAVE 2 vendors money — Box 3 Built for `detail.ap` / `detail.ap.expenses` × `expense`.
 *
 * @matrix-built {"modules":["vendors"],"cols":["expense"],"task":"WAVE2-VENDORS-AP-EXPENSES-BUILT","vertical":"column-wave","leafRe":"^detail\\.ap(\\.expenses)?$"}
 *
 * VendorDetail.tsx's A/P tab already had this fully wired (confirmed real by
 * verify-expense-column-wave.mjs's own audit note: "vendors already WIRED (VendorDetail.tsx A/P
 * tab)") — the vendors.required.json leaves `detail.ap` and `detail.ap.expenses` both require the
 * `expense` money column, but neither had ever been claimed Built in wire-sprint-built.json: the
 * wiring existed, only the Box-3 credit was missing. This guard proves the SPECIFIC leaf-scoped
 * wiring (not a word-blanket claim):
 *   - forward: vendorExpensesQuery scopes listExpenses by vendor_uuid (this vendor's expenses only,
 *     not the global expense list)
 *   - depth: the rendered table shows GL posting_status (money linkage visibility, not just a count)
 *   - reverse: each row is an EntityLink(kind="expense") drilling to the expense's own detail record,
 *     and EntityLink's "expense" case resolves to a real route (/accounting/expenses/:id)
 *
 * Self-test: node scripts/verify-vendor-ap-expenses-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-ap-expenses-wired";

const CHECKS = [
  {
    name: "VendorDetail imports listExpenses",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /import\s*\{[^}]*listExpenses[^}]*\}\s*from\s*"\.\.\/api\/accounting"/,
  },
  {
    name: "vendorExpensesQuery scopes listExpenses by this vendor's uuid (forward writer)",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /listExpenses\(companyId,\s*\{\s*vendor_uuid:\s*id/,
  },
  {
    name: "vendor A/P tab renders an Expenses section fed by vendorExpensesQuery",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /rows=\{vendorExpensesQuery\.data/,
  },
  {
    name: "expense rows show GL posting_status (money depth, not just existence)",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /key:\s*"posting_status"[\s\S]{0,120}render:\s*\(e\)\s*=>[\s\S]{0,60}e\.posting_status/,
  },
  {
    name: "expense rows drill via EntityLink kind=\"expense\" (reverse nav)",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /<EntityLink kind="expense" id=\{e\.id\}/,
  },
  {
    name: "EntityLink's expense case resolves to a real detail route",
    file: "apps/frontend/src/components/shared/EntityLink.tsx",
    pattern: /case\s*"expense":\s*\n\s*return\s*`\/accounting\/expenses\/\$\{id\}`/,
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
    "apps/frontend/src/pages/VendorDetail.tsx": `
      import { listExpenses, listVendorBills, type ExpenseListRow, type VendorBill } from "../api/accounting";
      const vendorExpensesQuery = useQuery({
        queryFn: () => listExpenses(companyId, { vendor_uuid: id, limit: 200 }).then((res) => res.rows),
      });
      <ParityTable<ExpenseListRow>
        rows={vendorExpensesQuery.data ?? []}
        columns={[
          {
            key: "expense_number",
            render: (e) => (
              <EntityLink kind="expense" id={e.id} label={entityLabel(e.expense_number, e.id, "Record")} />
            ),
          },
          {
            key: "posting_status",
            label: "GL",
            render: (e) => <span className="capitalize">{e.posting_status}</span>,
          },
        ]}
      />
    `,
    "apps/frontend/src/components/shared/EntityLink.tsx": `
      switch (kind) {
        case "expense":
          return \`/accounting/expenses/\${id}\`;
      }
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
console.log(`[${LABEL}] PASS — vendor A/P tab's expense forward-query + GL depth + reverse EntityLink all present`);
