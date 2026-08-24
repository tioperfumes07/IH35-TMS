#!/usr/bin/env node
// @matrix-built fleet:unit.profile.maintenance:{unit,connectivity,reverse_link}
import fs from "node:fs";

const LABEL = "verify-fleet-unit-maintenance-create-work-order-drill";
const FILE = "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx";
const source = fs.readFileSync(FILE, "utf8");

function verify(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(
    /to=\{`\/maintenance\/work-orders\/new\?unit_id=\$\{encodeURIComponent\(unitId\)\}`\}[\s\S]{0,180}>\s*Create work order/.test(text),
    "unit maintenance snapshot must drill directly into the mounted canonical work-order creator with unit_id",
  );
  need(
    !/to=\{`\/maintenance\?unit=\$\{unitId\}`\}/.test(text),
    "unit maintenance snapshot must not silently land on the maintenance dashboard",
  );
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(`[${LABEL}] FAILED\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(
      "/maintenance/work-orders/new?unit_id=${encodeURIComponent(unitId)}",
      "/maintenance?unit=${unitId}",
    ),
    source.replace("encodeURIComponent(unitId)", "unitId"),
    source.replace("unit_id=", "equipment_id="),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source) {
      console.error(`[${LABEL}] SELFTEST FIXTURE DRIFT — mutation ${index + 1}`);
      process.exit(1);
    }
    if (verify(mutation).length === 0) {
      console.error(`[${LABEL}] SELFTEST FAILED — mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }
  console.log(`[${LABEL}] SELFTEST PASS — ${mutations.length}/${mutations.length} dead-drill regressions rejected`);
}

console.log(`[${LABEL}] PASS — unit maintenance snapshot opens the canonical prefilled work-order creator`);
