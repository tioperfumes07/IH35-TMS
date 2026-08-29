#!/usr/bin/env node
import fs from "node:fs";

const files = {
  modal: "apps/frontend/src/pages/dispatch/LoadReassignModal.tsx",
  dropdown: "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx",
  ranked: "apps/frontend/src/components/dispatch/OptimalDriversPanel.tsx",
  test: "apps/frontend/src/pages/dispatch/LoadReassignModal.test.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = [
  ["modal owns selected label", source.modal.includes("const [driverLabel, setDriverLabel] = useState<string | null>(null)")],
  ["dropdown returns canonical label", source.dropdown.includes("onSelectedDriverLabelChange?.(row.display_name)")],
  ["ranked row returns canonical label", source.ranked.includes("onSelectedDriverLabelChange?.(d.display_name)")],
  ["auth gate receives selected label", source.modal.includes("driverLabel={driverLabel}")],
  ["regression rejects tombstone label", source.test.includes('queryByText("Driver — not visible")')],
];
if (process.argv.includes("--selftest")) checks[3][1] = false;
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} load-reassign selected-driver label checks`);
