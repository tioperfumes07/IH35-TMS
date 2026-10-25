#!/usr/bin/env node
/** INBOX-DEVIN-A 9–23 FE wiring ratchet — static only, USMCA fleet/fuel/tasks/compliance chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-inbox9-23-fe";

const CHECKS = [
  {
    file: "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
    tests: [
      (s) => /data-testid="fleet-need-company"/.test(s) || "fleet need-company testid",
      (s) => /data-testid="fleet-create-unit"/.test(s) || "fleet + Create Unit",
      (s) => /FleetTablePage operatingCompanyId=\{companyId\}/.test(s) || "lease-scoped roster",
    ],
  },
  {
    file: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
    tests: [(s) => /data-testid="fuel-card-overage-need-company"/.test(s) || "card-overage need-company"],
  },
  {
    file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
    tests: [
      (s) => /Import Fuel Transactions/.test(s) || "fuel import CTA",
      // ROUND 443.326 — History board mounts FuelTransactionsTable (ParityTable empty lives there).
      (s) => /FuelTransactionsTable/.test(s) || "history board mounts FuelTransactionsTable",
    ],
  },
  {
    file: "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx",
    tests: [
      // Repointed (ROUND 443.187 / 443.326): honest empty fuel history on the ParityTable board.
      (s) =>
        /No fuel transactions yet — use \+ Create for a manual office purchase, or Import Fuel Transactions/.test(s) ||
        "honest empty fuel history",
    ],
  },
  {
    file: "apps/frontend/src/components/tasks/CreateTaskModal.tsx",
    tests: [(s) => /data-testid="create-task-assignee-picker"/.test(s) || "tasks +Create assignee picker"],
  },
  {
    file: "apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx",
    tests: [(s) => /export function overdueRolloverDay/.test(s) || "overdue rollover helper"],
  },
  {
    file: "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx",
    tests: [
      (s) => /PropertyTaxRenditionPage/.test(s) && /RenditionListView/.test(s) || "property-tax page",
      (s) => /<Combobox[\s\S]*id="property-tax-district-picker"[\s\S]*allowAddNew=/.test(s) || "searchable appraisal-district picker with inline create",
      (s) => !/<select[\s\S]*value=\{districtId\}/.test(s) || "appraisal district must not use a native ID-valued select",
    ],
  },
  {
    file: "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
    tests: [(s) => /EntityLink[\s\S]*kind="load"/.test(s) || "unit current load EntityLink"],
  },
];

function readTracked(file) {
  const abs = path.join(ROOT, file);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function run(read = readTracked) {
  const problems = [];
  for (const { file, tests } of CHECKS) {
    const src = read(file);
    if (src == null) {
      problems.push(`missing ${file}`);
      continue;
    }
    for (const t of tests) {
      const msg = t(src);
      if (typeof msg === "string") problems.push(`${file}: ${msg}`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  // ROUND 443.187: the old selftest PASSED only when the real tree was RED ("nothing to catch on
  // green tree"), so it could never pass on a correct tree. It now plants in memory: every checked
  // file blanked must be caught (one problem per positive test), and the real tree must be green.
  const baseline = run();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL: clean tree is red:\n` + baseline.map((p) => `  ✗ ${p}`).join("\n"));
    process.exit(1);
  }
  let caught = 0;
  for (const { file } of CHECKS) {
    const planted = run((rel) => (rel === file ? "" : readTracked(rel)));
    if (planted.some((p) => p.startsWith(`${file}:`))) caught += 1;
    else console.error(`${LABEL} SELFTEST: blanked ${file} escaped`);
  }
  const district = CHECKS.find((c) => c.file.endsWith("PropertyTaxRenditionPage.tsx")).file;
  const nativeSelect = run((rel) =>
    rel === district ? `${readTracked(rel)}\n<select value={districtId}></select>` : readTracked(rel),
  );
  const nativeCaught = nativeSelect.some((p) => p.includes("must not use a native ID-valued select"));
  if (caught !== CHECKS.length || !nativeCaught) {
    console.error(`${LABEL} SELFTEST FAIL: caught ${caught}/${CHECKS.length} blanked files; native select plant caught=${nativeCaught}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS (${caught}/${CHECKS.length} blanked-file plants + native-select plant caught)`);
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAIL:\n` + problems.map((p) => `  ✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`${LABEL} PASS`);
