#!/usr/bin/env node
/**
 * LEAD 443.168 L — Engine Registry E-46 "one reserve query".
 *
 * Measured on prod before this step (read-only): the factoring KPI / per-customer table / GL tie-out agreed, but the
 * per-advance reserve tracker (views.factoring_reserve_balances over accounting.factoring_reserve_movements, no live
 * writer) reported a different total across 22 advances, and /factoring-reserve-balances split advance-header reserve
 * amounts proportionally — two more reserve figures. Four sources: reserve-by-customer.service.ts (its own GL sum),
 * factoring/reserve.service.ts, factoring-posting/reserve-tracker.service.ts, factoring-kpi.service.ts.
 *
 * Guards — the build fails when a second reserve figure appears:
 *   1. factoring-kpi.service.ts: reserveAccountBalance is THE query; factoringBookReserveCents and the escrow / cash
 *      reserve KPIs both call it; the balance SQL fragment is used nowhere else in that file.
 *   2. reserve-by-customer.service.ts ties to factoringBookReserveCents (no second GL sum of the reserve accounts).
 *   3. reserve.service.ts getFactorReserveBalances reads factoringBookReserveCents.
 *   4. reserve-tracker.service.ts reads no reserve balance view and exports no per-advance reserve balance.
 *   5. poster.service.ts listFactorReserveBalances reads reserveByCustomer — no proportional header split.
 *   6. No backend file reads views.factoring_reserve_balances / factoring.v_factor_reserve_balance.
 *
 * --selftest: plants each regression and asserts the guard fails.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  kpi: "apps/backend/src/factoring/factoring-kpi.service.ts",
  byCustomer: "apps/backend/src/factoring/reserve-by-customer.service.ts",
  reserve: "apps/backend/src/factoring/reserve.service.ts",
  tracker: "apps/backend/src/accounting/factoring-posting/reserve-tracker.service.ts",
  poster: "apps/backend/src/accounting/factoring-fees-posting/poster.service.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

function backendFiles(dir = resolve(ROOT, "apps/backend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") backendFiles(abs, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(abs);
  }
  return out;
}

const fnBody = (src, name) => src.match(new RegExp(`export async function ${name}\\([\\s\\S]*?\\n}\\n`))?.[0] ?? "";

export function check(src = {}, others = null) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const findings = [];
  const one = fnBody(s.kpi, "reserveAccountBalance");
  if (!one || !/postingsSql\("balance"\)/.test(one)) findings.push(`${F.kpi}: reserveAccountBalance (the one reserve query) is missing (1)`);
  if (!/reserveAccountBalance\(client, oci, asOf, acc\.escrow\.id\)/.test(fnBody(s.kpi, "factoringBookReserveCents")))
    findings.push(`${F.kpi}: factoringBookReserveCents does not read reserveAccountBalance (1)`);
  if (!/await reserveAccountBalance\(client, oci, range\.to, a\.id\)/.test(s.kpi)) findings.push(`${F.kpi}: the escrow / cash reserve KPIs run their own balance SQL (1)`);
  if ((s.kpi.match(/postingsSql\("balance"\)/g) ?? []).length !== 1) findings.push(`${F.kpi}: a second balance query over the reserve accounts (1)`);
  if (!/const gl = \(await factoringBookReserveCents\(client, oci, asOf\)\)\.total;/.test(s.byCustomer) || /reserveGlBalanceCents/.test(s.byCustomer))
    findings.push(`${F.byCustomer}: the per-customer table ties to its own GL sum, not the one reserve figure (2)`);
  if (!/factoringBookReserveCents\(client, tenantId/.test(fnBody(s.reserve, "getFactorReserveBalances"))) findings.push(`${F.reserve}: getFactorReserveBalances does not read the one reserve figure (3)`);
  const trackerCode = s.tracker.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  if (/views\.factoring_reserve_balances/.test(trackerCode) || /export async function (listFactoringReserveBalances|getFactoringReserveRollup)\(/.test(s.tracker))
    findings.push(`${F.tracker}: the per-advance reserve tracker is back — a second reserve figure (4)`);
  const poster = fnBody(s.poster, "listFactorReserveBalances");
  if (!/await reserveByCustomer\(/.test(poster) || /reserve_amount_cents \* \(invoice_total_cents/.test(poster))
    findings.push(`${F.poster}: listFactorReserveBalances splits advance headers instead of reading the reserve engine (5)`);
  const files = others ?? backendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  for (const [rel, text] of files) {
    const code = text.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    if (/FROM\s+(views\.factoring_reserve_balances|factoring\.v_factor_reserve_balance)\b/.test(code)) findings.push(`${rel}: reads a retired reserve balance view (6)`);
  }
  return findings;
}

if (process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check().length) {
    console.error("SELFTEST FAIL: baseline not clean", check());
    process.exit(1);
  }
  const plants = [
    ["kpi own SQL", { kpi: base.kpi.replace("await reserveAccountBalance(client, oci, range.to, a.id)", "await reserveAccountBalanceX(client, oci, range.to, a.id)") }],
    ["second balance sql", { kpi: base.kpi + '\nconst x = postingsSql("balance");\n' }],
    ["by-customer own sum", { byCustomer: base.byCustomer.replace("const gl = (await factoringBookReserveCents(client, oci, asOf)).total;", "const gl = await reserveGlBalanceCents(client, oci, asOf, ids);") }],
    ["reserve.service off engine", { reserve: base.reserve.replace("factoringBookReserveCents(client, tenantId", "otherReserve(client, tenantId") }],
    ["tracker back", { tracker: base.tracker + "\nexport async function getFactoringReserveRollup(x: string) {\n}\n" }],
    ["poster proportional", { poster: base.poster.replace("await reserveByCustomer(", "await somethingElse(") }],
  ];
  for (const [name, src] of plants) {
    if (check(src).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  if (check({}, [["apps/backend/src/x.ts", "await q(`SELECT * FROM views.factoring_reserve_balances`)"]]).length === 0) {
    console.error('SELFTEST FAIL: plant "view reader" not caught');
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${plants.length + 1} plants caught`);
  process.exit(0);
}

const findings = check();
if (findings.length) {
  console.error(`verify-one-faro-reserve-query FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-one-faro-reserve-query PASS: every reserve reader reads the one reserve query (E-46)");
