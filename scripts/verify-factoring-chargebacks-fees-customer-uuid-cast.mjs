#!/usr/bin/env node
// ACCT-F26015 (owner, 2026-09-07) -- caught live while re-verifying the ACCT-F26014
// customer-activity payments.status fix on the same Del-Can Logistics customer profile page:
// GET /api/v1/factoring/chargebacks-fees?customer_id=... 500'd with
// "operator does not exist: text = uuid". The LATERAL join selected i.customer_id::text AS
// customer_id, but the customerFilter clause compares inv.customer_id against $N::uuid --
// a type mismatch every time a customer_id filter was passed. Pins the fix: the chargebacks-fees
// LATERAL join in factoring.routes.ts must select i.customer_id with no ::text cast, matching the
// sibling recourse-pipeline route's LATERAL join (which never had this bug) and the filter's own
// ::uuid cast.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const targetFile = path.join(repoRoot, "apps/backend/src/factoring/factoring.routes.ts");

function problemsForSource(src) {
  const problems = [];
  if (/i\.customer_id::text AS customer_id/.test(src)) {
    problems.push(
      "chargebacks-fees LATERAL join must not cast i.customer_id to text -- customerFilter compares it against $N::uuid (operator does not exist: text = uuid)"
    );
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const clean = fs.readFileSync(targetFile, "utf8");
    const mutants = [
      {
        name: "reverts to the text-cast customer_id (type-mismatch 500)",
        src: clean.replace(
          "                i.customer_id,\n                c.customer_name,\n                i.source_load_id::text AS load_id",
          "                i.customer_id::text AS customer_id,\n                c.customer_name,\n                i.source_load_id::text AS load_id"
        ),
      },
    ];
    let failures = 0;
    for (const m of mutants) {
      const problems = problemsForSource(m.src);
      if (problems.length === 0) {
        console.error(`SELFTEST FAIL: mutant "${m.name}" was not caught`);
        failures++;
      } else {
        console.log(`selftest OK: mutant "${m.name}" caught (${problems.length} problem(s))`);
      }
    }
    const cleanProblems = problemsForSource(clean);
    if (cleanProblems.length !== 0) {
      console.error("SELFTEST FAIL: clean source flagged problems:", cleanProblems);
      failures++;
    } else {
      console.log("selftest OK: clean source passes with 0 problems");
    }
    if (failures > 0) {
      console.error(`SELFTEST: ${failures} failure(s)`);
      process.exit(1);
    }
    console.log(`SELFTEST: ${mutants.length + 1}/${mutants.length + 1} checks PASS`);
    process.exit(0);
  }

  const src = fs.readFileSync(targetFile, "utf8");
  const problems = problemsForSource(src);
  if (problems.length > 0) {
    console.error("verify-factoring-chargebacks-fees-customer-uuid-cast: RED");
    for (const p of problems) console.error(" - " + p);
    process.exit(1);
  }
  console.log("verify-factoring-chargebacks-fees-customer-uuid-cast: OK");
  process.exit(0);
}

main();
