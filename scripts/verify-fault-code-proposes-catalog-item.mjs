#!/usr/bin/env node
/**
 * E-10 addition: a fault code proposes its catalog repair item through the owner's fault rules (exact code, else the
 * whole SPN), and every fault reader shows Samsara's own component description -- one shared definition, no seeded
 * reference table.
 */
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--selftest")) selftest();

const helper = readFileSync("apps/backend/src/maintenance/fault-catalog-proposal.ts", "utf8");
const proc = readFileSync("apps/backend/src/integrations/samsara/fault-code-processor.service.ts", "utf8");
const rules = readFileSync("apps/backend/src/maintenance/fault-auto-wo/fault-rules.routes.ts", "utf8");
const mig = readFileSync("db/migrations/202615200900_fault_rules_catalog_items.sql", "utf8");
const checks = [
  [/service_task_id uuid NULL REFERENCES catalogs\.maintenance_service_tasks\(id\)/.test(mig) && /labor_code_id uuid NULL REFERENCES catalogs\.maintenance_labor_codes\(id\)/.test(mig), "rules link to the catalog"],
  [/r\.fault_code = \$\{h\}\.fault_code OR \$\{h\}\.fault_code LIKE r\.fault_code \|\| ' FMI %'/.test(helper) && /\$2 LIKE fault_code \|\| ' FMI %'/.test(proc), "exact code or whole-SPN rule, same rule in reads and the processor"],
  [/spnDescription/.test(helper) && !/INSERT/.test(helper), "description comes from Samsara's own payload"],
  [/proposed_service_task: rule\?\.service_task_name/.test(proc) && /bucket, fault_code/.test(proc), "auto work order carries the fault code + the proposal"],
  [/AND id <> \$4::uuid/.test(proc) && /hasRecentUnresolvedFault\(client, event\.operating_company_id, localUnitId, fault\.code, history\.id\)/.test(proc), "the de-dup check never matches the history row it just inserted (auto-WO could never fire)"],
  [/st\.operating_company_id = \$1::uuid/.test(rules) && /lc\.operating_company_id = \$1::uuid/.test(rules), "rule catalog ids are company-scoped"],
  ...["apps/backend/src/maintenance/fault-code-alerts.routes.ts", "apps/backend/src/telematics/telematics-linkage.service.ts", "apps/backend/src/driver-profile/driver-profile-tabs.service.ts"]
    .map((f) => [/faultProposalJoinSql\("h"\)/.test(readFileSync(f, "utf8")) && /faultDescriptionSql\("h"\)/.test(readFileSync(f, "utf8")), `${f} uses the shared description + proposal`]),
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-fault-code-proposes-catalog-item: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-fault-code-proposes-catalog-item: OK (${checks.length})`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-fault-code-proposes-catalog-item", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
