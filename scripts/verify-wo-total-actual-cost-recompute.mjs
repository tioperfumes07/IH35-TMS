#!/usr/bin/env node
/**
 * ACCT-F5626 — maintenance.work_orders.total_actual_cost is set ONCE at WO creation and never
 * written again anywhere else in the codebase. Both the line-item add route (POST
 * .../work-orders/:id/line-items) and the line-item delete route (DELETE
 * .../work-orders/:id/line-items/:lid) insert/delete maintenance.work_order_lines rows and call
 * validateWoVendorInvoiceTotals to VALIDATE the new sum against any already-linked bill/parts-invoice
 * — but validating is not persisting. autoCreateBillFromWO / autoCreateExpenseFromWO both derive the
 * auto-posted AP amount directly from total_actual_cost, so editing lines before the bill/expense is
 * generated silently posts the stale creation-time total.
 *
 * validateWoVendorInvoiceTotals is the single choke point both routes already call — this guard
 * proves it also PERSISTS the recomputed total (UPDATE maintenance.work_orders SET total_actual_cost)
 * BEFORE its early-return (the case most exposed to going stale, since no bill/parts-invoice is
 * linked yet and nothing else checks the total there at all).
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/maintenance/wo-cost-validation.ts`, "utf8");

  const fnMatch = src.match(/export async function validateWoVendorInvoiceTotals\s*\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("validateWoVendorInvoiceTotals function not found in wo-cost-validation.ts");
    return failures;
  }
  const fnBody = fnMatch[0];

  if (!/UPDATE\s+maintenance\.work_orders\s+SET\s+total_actual_cost/i.test(fnBody)) {
    failures.push("validateWoVendorInvoiceTotals must UPDATE maintenance.work_orders SET total_actual_cost");
    return failures;
  }

  // The write must happen BEFORE the early return (the case with no linked bill/parts-invoice —
  // the exposed one), not only after it, or it would never fire for the most common edit.
  const earlyReturnIdx = fnBody.search(/if\s*\(\s*partsCount\s*===\s*0\s*&&\s*billsCount\s*===\s*0\s*\)\s*return/);
  const updateIdx = fnBody.search(/UPDATE\s+maintenance\.work_orders\s+SET\s+total_actual_cost/i);
  if (earlyReturnIdx === -1) {
    failures.push("could not locate the early-return (no linked bill/parts-invoice) branch to check ordering against");
  } else if (updateIdx === -1 || updateIdx > earlyReturnIdx) {
    failures.push(
      "the total_actual_cost UPDATE must run BEFORE the early-return branch, or an edit with no linked bill/parts-invoice yet (the most exposed case) never persists"
    );
  }

  // The write must use the SAME line-total the function computed for validation (lineTotal), not a
  // hardcoded/different value that could silently drift from what was actually validated.
  if (!/\[woId,\s*lineTotal,\s*operatingCompanyId\]/.test(fnBody)) {
    failures.push("the UPDATE must use [woId, lineTotal, operatingCompanyId] — the exact sum and explicit company scope");
  }

  if (!/JOIN\s+maintenance\.work_orders[\s\S]*?operating_company_id\s*=\s*\$2::uuid/i.test(fnBody)) {
    failures.push("work_order_lines aggregation must join the company-scoped work order");
  }
  if (!/UPDATE\s+maintenance\.work_orders[\s\S]*?operating_company_id\s*=\s*\$3::uuid/i.test(fnBody)) {
    failures.push("total_actual_cost UPDATE must include operating_company_id");
  }
  for (const table of ["parts_invoice_links", "bills"]) {
    const query = fnBody.match(new RegExp(`FROM\\s+(?:maintenance\\.|accounting\\.)${table}[\\s\\S]*?\\[woId,\\s*operatingCompanyId\\]`, "i"))?.[0] ?? "";
    if (!/operating_company_id\s*=\s*\$2::uuid/i.test(query)) {
      failures.push(`${table} lookup must include operating_company_id and bind it`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-wo-total-actual-cost-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
export async function validateWoVendorInvoiceTotals(client, woId, operatingCompanyId) {
  const linesRes = await client.query("SELECT SUM(li.total_cost) AS total FROM maintenance.work_order_lines li JOIN maintenance.work_orders wo ON wo.id = li.work_order_uuid AND wo.operating_company_id = $2::uuid WHERE li.work_order_uuid = $1::uuid", [woId, operatingCompanyId]);
  const lineTotal = linesRes.rows[0]?.total ?? 0;

  await client.query(
    \`UPDATE maintenance.work_orders SET total_actual_cost = $2::numeric WHERE id = $1::uuid AND operating_company_id = $3::uuid\`,
    [woId, lineTotal, operatingCompanyId]
  );

  const partsRes = await client.query("SELECT COUNT(*)::int AS cnt FROM maintenance.parts_invoice_links WHERE work_order_id = $1::uuid AND operating_company_id = $2::uuid", [woId, operatingCompanyId]);
  const partsCount = Number(partsRes.rows[0]?.cnt ?? 0);
  const billsRes = await client.query("SELECT COUNT(*)::int AS cnt FROM accounting.bills WHERE linked_work_order_uuid = $1::uuid AND operating_company_id = $2::uuid", [woId, operatingCompanyId]);
  const billsCount = Number(billsRes.rows[0]?.cnt ?? 0);

  if (partsCount === 0 && billsCount === 0) return;
}
`;
  mk("apps/backend/src/maintenance/wo-cost-validation.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: no UPDATE at all (the original bug).
  mk(
    "apps/backend/src/maintenance/wo-cost-validation.ts",
    good.replace(/await client\.query\(\s*`UPDATE[\s\S]*?\[woId, lineTotal, operatingCompanyId\]\s*\);\n\n/, "")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing UPDATE entirely should be caught");

  // Regression 2: UPDATE exists but only at the very END of the function (after the early return),
  // so it never fires for the exposed no-linked-invoice case — the exact shape of the original bug,
  // where "validate" ran but nothing ever persisted for the most common edit.
  mk(
    "apps/backend/src/maintenance/wo-cost-validation.ts",
    good
      .replace(/await client\.query\(\s*`UPDATE[\s\S]*?\[woId, lineTotal, operatingCompanyId\]\s*\);\n\n/, "")
      .replace(
        /\n\}$/,
        `\n  await client.query(\`UPDATE maintenance.work_orders SET total_actual_cost = $2::numeric WHERE id = $1::uuid AND operating_company_id = $3::uuid\`, [woId, lineTotal, operatingCompanyId]);\n}`
      )
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: UPDATE placed after the early-return branch should be caught");

  // Regression 3: the recompute write falls back to bare UUID scope.
  mk(
    "apps/backend/src/maintenance/wo-cost-validation.ts",
    good.replace(/ AND operating_company_id = \$3::uuid/g, "")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: bare-ID work_orders UPDATE should be caught");

  // Regression 4: a linked financial lookup drops its explicit company predicate.
  mk(
    "apps/backend/src/maintenance/wo-cost-validation.ts",
    good.replace(/ AND operating_company_id = \$2::uuid\", \[woId, operatingCompanyId\]\);\n  const billsCount/, '\", [woId, operatingCompanyId]);\n  const billsCount')
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: unscoped accounting.bills lookup should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-wo-total-actual-cost-recompute --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-wo-total-actual-cost-recompute — OK");
}
