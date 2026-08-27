#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/maintenance/internal-labor.routes.ts";
const source = fs.readFileSync(path, "utf8");

function verify(text) {
  const failures = [];
  const checks = [
    [/const conditions: string\[\] = \["il\.operating_company_id = \$1::uuid", "il\.is_active = true"\]/, "list read must explicitly scope the labor table"],
    [/WHERE il\.start_time BETWEEN \$1 AND \$2\s+AND il\.operating_company_id = \$3::uuid/, "productivity read must explicitly scope the labor table"],
    [/FROM maintenance\.work_orders wo[\s\S]*wo\.operating_company_id = \$1::uuid[\s\S]*wo\.unit_id = u\.id[\s\S]*COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$1::uuid/, "create must prove canonical company WO-to-unit linkage"],
    [/FROM maintenance\.internal_labor_log\s+WHERE id = \$1\s+AND operating_company_id = \$2::uuid\s+AND is_active = true\s+AND end_time IS NULL\s+FOR UPDATE/, "close pre-read must be company-scoped and terminal-CAS locked"],
    [/UPDATE maintenance\.internal_labor_log[\s\S]*WHERE id = \$1\s+AND operating_company_id = \$6::uuid\s+AND is_active = true\s+AND end_time IS NULL\s+RETURNING \*/, "close mutation must repeat company and source-state CAS"],
    [/UPDATE maintenance\.parts_inventory[\s\S]*operating_company_id = \$3::uuid[\s\S]*on_hand_qty >= \$1[\s\S]*RETURNING id[\s\S]*InternalLaborPartConflictError/, "each part decrement must be scoped and fail closed"],
    [/UPDATE maintenance\.internal_labor_log[\s\S]*SET is_active = false[\s\S]*operating_company_id = \$2::uuid[\s\S]*is_active = true[\s\S]*RETURNING id/, "archive must be scoped and result checked"],
    [/maintenance\.internal_labor\.created[\s\S]*maintenance\.internal_labor\.closed[\s\S]*maintenance\.internal_labor\.archived/, "create, close, and archive must append audit evidence"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(text)) failures.push(message);
  if (/client\.query\("(?:BEGIN|COMMIT|ROLLBACK)"\)/.test(text)) failures.push("route must rely on withCurrentUser's single transaction");
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('"il.operating_company_id = $1::uuid", ', ""),
    source.replace("AND il.operating_company_id = $3::uuid", "AND true"),
    source.replace("AND wo.operating_company_id = $1::uuid", "AND true"),
    source.replace("AND operating_company_id = $2::uuid\n              AND is_active = true\n              AND end_time IS NULL", "AND is_active = true"),
    source.replace("AND operating_company_id = $6::uuid", "AND true"),
    source.replace("AND operating_company_id = $3::uuid", "AND true"),
    source.replace("AND operating_company_id = $2::uuid\n            AND is_active = true\n          RETURNING id", "RETURNING id"),
    source.replace('await appendCrudAudit(client, user.uuid, "maintenance.internal_labor.closed"', 'await appendCrudAudit(client, user.uuid, "maintenance.internal_labor.close_removed"'),
    source.replace("// withCurrentUser owns the transaction.", 'await client.query("BEGIN");\n        // withCurrentUser owns the transaction.'),
  ];
  const escaped = mutations.flatMap((text, index) => (verify(text).length === 0 ? [index + 1] : []));
  if (escaped.length) {
    console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("PASS: internal-labor is explicitly company-scoped across all mounted read/write surfaces");
