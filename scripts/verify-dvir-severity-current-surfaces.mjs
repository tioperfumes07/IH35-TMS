#!/usr/bin/env node
import fs from "node:fs";

const files = {
  manifest: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  workOrder: fs.readFileSync("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", "utf8"),
  pwa: fs.readFileSync("apps/driver-pwa/src/pages/DVIR.tsx", "utf8"),
  item: fs.readFileSync("apps/driver-pwa/src/components/DvirItemRow.tsx", "utf8"),
};

function inspect(input) {
  const failures = [];
  const checks = [
    [input.manifest, /path="\/maintenance\/pre-flight-dvir"[\s\S]*<MaintenanceTabRoute tabId="pre_flight_dvir"/, "canonical Maintenance route/tab missing"],
    [input.workOrder, /import \{ DvirSeverityBadge \}[\s\S]*<DvirSeverityBadge severity=\{String\(wo\.severity \?\? ""\)\}/, "work-order severity badge missing or unsafe for unknown API data"],
    [input.pwa, /hasMajor = items\.some\(\(item\) => item\.status === "major"\)/, "major detection missing"],
    [input.pwa, /majorItemsValid[\s\S]*item\.note\.trim\(\)\.length > 0 && item\.photo_keys\.length > 0/, "major note/photo proof missing"],
    [input.pwa, /canSubmit = Boolean\(signature\) && \(!hasMajor \|\| majorItemsValid\)/, "major submission gate missing"],
    [input.pwa, /out_of_service: hasMajor/, "major DVIR does not stamp OOS"],
    [input.item, /key: "pass"[\s\S]*key: "minor"[\s\S]*key: "major"/, "three-state picker missing"],
    [input.item, /onStatusChange\(status\.key\)/, "picker does not update canonical item status"],
  ];
  for (const [value, pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["manifest", 'path="/maintenance/pre-flight-dvir"', 'path="/maintenance/retired-dvir"'],
    ["workOrder", '<DvirSeverityBadge severity={String(wo.severity ?? "")}', '<span data-stale-severity={String(wo.severity ?? "")}'],
    ["pwa", 'item.status === "major"', 'item.status === "pass"'],
    ["pwa", "item.note.trim().length > 0", "true"],
    ["pwa", "!hasMajor || majorItemsValid", "true"],
    ["pwa", "out_of_service: hasMajor", "out_of_service: false"],
    ["item", '{ key: "minor"', '{ key: "advisory"'],
    ["item", "onStatusChange(status.key)", "onStatusChange(item.status)"],
  ];
  for (const [key, before, after] of mutations) {
    if (!files[key].includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    const mutated = { ...files, [key]: files[key].replace(before, after) };
    if (inspect(mutated).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-dvir-severity-current-surfaces --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(files);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-dvir-severity-current-surfaces PASS — PWA→queue→WO severity remains mounted");
