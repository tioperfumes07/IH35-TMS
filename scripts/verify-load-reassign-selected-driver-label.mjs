#!/usr/bin/env node
import fs from "node:fs";

const files = {
  modal: "apps/frontend/src/pages/dispatch/LoadReassignModal.tsx",
  dropdown: "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx",
  ranked: "apps/frontend/src/components/dispatch/OptimalDriversPanel.tsx",
  test: "apps/frontend/src/pages/dispatch/LoadReassignModal.test.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(sources) {
  return [
    ["modal owns selected label", sources.modal.includes("const [driverLabel, setDriverLabel] = useState<string | null>(null)")],
    ["dropdown returns canonical label", sources.dropdown.includes("onSelectedDriverLabelChange?.(row.display_name)")],
    ["ranked row returns canonical label", sources.ranked.includes("onSelectedDriverLabelChange?.(d.display_name)")],
    ["auth gate receives selected label", sources.modal.includes("driverLabel={driverLabel}")],
    ["regression rejects tombstone label", sources.test.includes('queryByText("Driver — not visible")')],
  ];
}

if (process.argv.includes("--selftest")) {
  const mutated = { ...source, modal: source.modal.replace("driverLabel={driverLabel}", "driverLabel={null}") };
  if (mutated.modal === source.modal) {
    console.error("FAIL: selftest setup could not remove the selected driver label handoff");
    process.exit(1);
  }
  const failures = audit(mutated).filter(([, ok]) => !ok).map(([name]) => name);
  if (failures.length !== 1 || failures[0] !== "auth gate receives selected label") {
    console.error(`FAIL: planted selected-label defect was not isolated and rejected (${failures.join(", ")})`);
    process.exit(1);
  }
  console.log("PASS: selftest rejects a missing selected-driver label handoff");
  process.exit(0);
}

const checks = audit(source);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} load-reassign selected-driver label checks`);
