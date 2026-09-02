import fs from "node:fs";

const migration = fs.readFileSync("db/migrations/202613370002_go19_bill_driver_recovery_parity.sql", "utf8");
const service = fs.readFileSync("apps/backend/src/accounting/bills.service.ts", "utf8");
const route = fs.readFileSync("apps/backend/src/accounting/bills.routes.ts", "utf8");

function verify(parts) {
  return [
    /recover_from_driver boolean NOT NULL DEFAULT false/.test(parts.migration),
    /recover_deduction_type text/.test(parts.migration),
    /does not create a deduction automatically/.test(parts.migration),
    /bill_recovery_requires_driver/.test(parts.service),
    /bill_recovery_requires_deduction_type/.test(parts.service),
    /recover_from_driver = \$\$\{values\.length\}::boolean/.test(parts.service),
    /recover_deduction_type = \$\$\{values\.length\}::text/.test(parts.service),
    /recover_from_driver: z\.boolean\(\)\.optional\(\)/.test(parts.route),
    /recover_deduction_type: z\.string\(\)\.trim\(\)\.min\(1\)/.test(parts.route),
  ].every(Boolean);
}

const parts = { migration, service, route };
if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...parts, migration: migration.replace("DEFAULT false", "DEFAULT true") },
    { ...parts, service: service.replace("bill_recovery_requires_driver", "removed_driver_guard") },
    { ...parts, route: route.replace("recover_from_driver: z.boolean().optional()", "recover_from_driver: z.any()") },
  ];
  if (!verify(parts) || mutations.some(verify)) process.exit(1);
  console.log("verify-go19-bill-driver-recovery-parity SELFTEST PASS — 3/3 planted regressions rejected");
  process.exit(0);
}
if (!verify(parts)) process.exit(1);
console.log("verify-go19-bill-driver-recovery-parity PASS");
