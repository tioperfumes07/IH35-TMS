#!/usr/bin/env node
import fs from "node:fs";

const CHECKS = [
  ["apps/backend/src/dispatch/auth-gates/gate-registry.service.ts", /checkGates/, "registry"],
  ["apps/backend/src/dispatch/auth-gates/wf-044-advisory.gate.ts", /WF-044/, "wf-044"],
  ["apps/backend/src/dispatch/auth-gates/wf-050-dvir-major.gate.ts", /WF-050/, "wf-050"],
  ["apps/backend/src/dispatch/auth-gates/wf-038-active-driver.gate.ts", /WF-038/, "wf-038"],
  ["apps/backend/src/dispatch/auth-gates/wf-038-active-driver.gate.ts", /wf038_driver_dca\.driver_id = d\.id[\s\S]{0,180}wf038_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}wf038_driver_dca\.is_authorized = true[\s\S]{0,180}wf038_driver_dca\.deactivated_at IS NULL/, "wf-038 active shared-driver scope"],
  ["apps/backend/src/dispatch/auth-gates/routes.ts", /registerDispatchAuthGateRoutes/, "routes"],
  ["apps/backend/src/dispatch/auth-gates/routes.ts", /checkGates/, "mutation gate hook"],
  ["apps/backend/src/index.ts", /registerDispatchAuthGateRoutes/, "index"],
  ["apps/frontend/src/components/dispatch/AuthGatePanel.tsx", /AuthGatePanel/, "panel"],
  ["apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx", /AuthGatePanel/, "book load"],
  ["apps/frontend/src/pages/dispatch/LoadReassignModal.tsx", /AuthGatePanel/, "assignment edit"],
  [".block-ready/GAP-47.json", /"block_id": "GAP-47"/, "gap evidence"],
];

const files = Object.fromEntries([...new Set(CHECKS.map(([file]) => file))].map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""]));
const audit = (candidate) => CHECKS.flatMap(([file, pattern, label]) => pattern.test(candidate[file] ?? "") ? [] : [`${file}: ${label}`]);

if (process.argv.includes("--selftest")) {
  const setup = audit(files);
  if (setup.length) {
    console.error(`verify:dispatch-auth-gates SELFTEST setup FAIL\n- ${setup.join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern, label] of CHECKS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const mutated = { ...files, [file]: files[file].replace(new RegExp(pattern.source, flags), "REMOVED") };
    if (mutated[file] === files[file] || audit(mutated).length === 0) {
      console.error(`verify:dispatch-auth-gates SELFTEST FAIL — ${file}: ${label}`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`verify:dispatch-auth-gates SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(files);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("verify:dispatch-auth-gates — OK");
