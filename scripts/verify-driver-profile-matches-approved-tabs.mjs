#!/usr/bin/env node
/**
 * DRV-F419 — surviving driver profile matches the approved 9 tabs, name-click
 * opens it, tab is URL-synced, and Drivers.tsx does not stack two NavyPageSubNav
 * rows with the same label.
 *
 * Unnumbered (Rule 37). Claim an EVEN verify-step to main after merge.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-matches-approved-tabs";

const APPROVED = [
  "Overview",
  "Settlements",
  "Additional payments",
  "Cash advances",
  "Loads",
  "Fuel",
  "Complaints",
  "Documents",
  "Driver disputes",
];

const PATHS = {
  tabs: "apps/frontend/src/pages/drivers/driverProfileTabs.ts",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  roster: "apps/frontend/src/pages/Drivers.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  detail: "apps/frontend/src/pages/DriverDetail.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractTabList(src) {
  const m = src.match(/export const DRIVER_PROFILE_TABS = \[([\s\S]*?)\] as const/);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function navyRowsWithSameLabel(src) {
  const bands = [];
  const re = /<NavyPageSubNav\b([\s\S]*?)\/>/g;
  let match;
  while ((match = re.exec(src))) {
    const labels = [...match[1].matchAll(/label:\s*"([^"]+)"/g)].map((x) => x[1]);
    bands.push(labels);
  }
  const seen = new Map();
  for (const labels of bands) {
    for (const label of labels) {
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
    }
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([label]) => label);
}

function audit(files) {
  const failures = [];
  const tabs = extractTabList(files.tabs);
  if (!tabs) failures.push("RULE 1: DRIVER_PROFILE_TABS missing");
  else if (tabs.join("|") !== APPROVED.join("|")) {
    failures.push(`RULE 1: tab list is [${tabs.join(", ")}] — must equal [${APPROVED.join(", ")}]`);
  }

  if (!/onRowClick=\{\(row\) => navigate\(`\/drivers\/\$\{row\.id\}`\)\}/.test(files.roster)) {
    failures.push("RULE 2: Drivers.tsx name-click must navigate to /drivers/${row.id}");
  }
  if (!/function DriverDetailRoute\(\)[\s\S]*return <DriverProfilePage/.test(files.manifest)) {
    failures.push("RULE 2: /drivers/:id must render DriverProfilePage (the survivor)");
  }
  if (!/path="\/drivers\/:id\/edit"/.test(files.manifest)) {
    failures.push("RULE 2: DriverDetail must survive only as /drivers/:id/edit");
  }
  if (!/DriverProfileAliasRedirect/.test(files.manifest)) {
    failures.push("RULE 2: /drivers/:id/profile must redirect to the surviving profile");
  }

  if (!/parseDriverProfileTab\(searchParams\)/.test(files.profile)) {
    failures.push("RULE 3: surviving profile must parse tab from URLSearchParams, not a raw string");
  }
  if (/useState<DriverProfileTab>/.test(files.profile) || /useState<DriverTab>/.test(files.profile)) {
    failures.push("RULE 3: surviving profile must not hold the tab in useState");
  }
  if (!/export function parseDriverProfileTab\(raw: string \| null \| URLSearchParams\)/.test(files.tabs)) {
    failures.push("RULE 3: parseDriverProfileTab must accept URLSearchParams (parseDriverSubnav shape)");
  }

  const dupes = navyRowsWithSameLabel(files.roster);
  if (dupes.length) {
    failures.push(`RULE 4: Drivers.tsx NavyPageSubNav repeats label(s): ${dupes.join(", ")}`);
  }
  const navyCount = (files.roster.match(/<NavyPageSubNav\b/g) ?? []).length;
  if (navyCount !== 1) {
    failures.push(`RULE 4: Drivers.tsx must have exactly one NavyPageSubNav (found ${navyCount})`);
  }
  if (!/testId="drivers-status-chips"|data-testid="drivers-status-chips"/.test(files.roster) || !/SegmentedControl/.test(files.roster)) {
    failures.push("RULE 4: roster filters must be SegmentedControl chips, not NavyPageSubNav");
  }

  return failures;
}

function selftest() {
  const good = {
    tabs: `export const DRIVER_PROFILE_TABS = [\n  "Overview",\n  "Settlements",\n  "Additional payments",\n  "Cash advances",\n  "Loads",\n  "Fuel",\n  "Complaints",\n  "Documents",\n  "Driver disputes",\n] as const;\nexport function parseDriverProfileTab(raw: string | null | URLSearchParams): DriverProfileTab { return "Overview"; }`,
    profile: `const activeTab = parseDriverProfileTab(searchParams);\n`,
    roster: `onRowClick={(row) => navigate(\`/drivers/\${row.id}\`)}\n<NavyPageSubNav items={DRIVERS_SUBNAV.map((tab) => ({ label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] }))} />\n<SegmentedControl testId="drivers-status-chips" />`,
    manifest: `function DriverDetailRoute() {\n  return <DriverProfilePage />;\n}\npath="/drivers/:id/edit"\nDriverProfileAliasRedirect`,
    detail: ``,
  };
  const goodFails = audit(good);
  if (goodFails.length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixture rejected:`);
    for (const f of goodFails) console.error(`  - ${f}`);
    process.exit(1);
  }
  const bad = {
    ...good,
    tabs: `export const DRIVER_PROFILE_TABS = ["Overview", "Safety"] as const;\nexport function parseDriverProfileTab(raw: string | null): DriverProfileTab { return "Overview"; }`,
    profile: `const [activeTab, setActiveTab] = useState<DriverProfileTab>("Overview");`,
    roster: `onRowClick={(row) => navigate(\`/drivers/\${row.id}/profile\`)}\n<NavyPageSubNav items={[{ label: "Drivers", to: "/drivers" }]} />\n<NavyPageSubNav items={[{ label: "Drivers", to: "#drivers" }]} />`,
    manifest: `function DriverDetailRoute() { return <DriverDetailPage />; }`,
  };
  const badFails = audit(bad);
  if (badFails.length < 4) {
    console.error(`${LABEL} SELFTEST FAIL — bad fixture not caught (${badFails.length} failures)`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const files = Object.fromEntries(Object.entries(PATHS).map(([k, rel]) => [k, read(rel)]));
const failures = audit(files);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — approved 9 tabs, name-click, URL-sync, one NavyPageSubNav`);
process.exit(0);
