#!/usr/bin/env node
/**
 * DRV-F420 — surviving driver profile matches the approved 12 strip + 5 More tabs,
 * name-click opens it, tab is URL-synced, and Drivers.tsx does not stack two
 * NavyPageSubNav rows with the same label. /edit redirects to ?tab=edit.
 *
 * Unnumbered (Rule 37). Claim an EVEN verify-step to main after merge.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-matches-approved-tabs";

const APPROVED_STRIP = [
  "Overview",
  "Settlements",
  "Additional payments",
  "Cash advances",
  "Pay & escrow",
  "Loads",
  "Fuel",
  "Reports & damage",
  "Complaints",
  "Safety & accidents",
  "Documents",
  "Driver disputes",
];

const APPROVED_MORE = [
  "Safety file",
  "ELD edits",
  "Legal matters",
  "QBO mapping",
  "Audit history",
];

const PATHS = {
  tabs: "apps/frontend/src/pages/drivers/driverProfileTabs.ts",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  roster: "apps/frontend/src/pages/Drivers.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  board: "apps/frontend/src/components/boards/DriverOverviewBoard.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractConstArray(src, name) {
  const m = src.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`));
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
  const strip = extractConstArray(files.tabs, "DRIVER_PROFILE_STRIP_TABS");
  const more = extractConstArray(files.tabs, "DRIVER_PROFILE_MORE_TABS");
  if (!strip) failures.push("RULE 1: DRIVER_PROFILE_STRIP_TABS missing");
  else if (strip.join("|") !== APPROVED_STRIP.join("|")) {
    failures.push(`RULE 1: strip is [${strip.join(", ")}] — must equal [${APPROVED_STRIP.join(", ")}]`);
  }
  if (!more) failures.push("RULE 1: DRIVER_PROFILE_MORE_TABS missing");
  else if (more.join("|") !== APPROVED_MORE.join("|")) {
    failures.push(`RULE 1: More is [${more.join(", ")}] — must equal [${APPROVED_MORE.join(", ")}]`);
  }
  if (!/DRIVER_PROFILE_STRIP_TABS\.map/.test(files.board)) {
    failures.push("RULE 1: DriverOverviewBoard must render DRIVER_PROFILE_STRIP_TABS");
  }
  if (!/DRIVER_PROFILE_MORE_TABS/.test(files.board)) {
    failures.push("RULE 1: DriverOverviewBoard must carry DRIVER_PROFILE_MORE_TABS");
  }

  if (!/onRowClick=\{\(row\) => navigate\(`\/drivers\/\$\{row\.id\}`\)\}/.test(files.roster)) {
    failures.push("RULE 2: Drivers.tsx name-click must navigate to /drivers/${row.id}");
  }
  if (!/function DriverDetailRoute\(\)[\s\S]*return <DriverProfilePage/.test(files.manifest)) {
    failures.push("RULE 2: /drivers/:id must render DriverProfilePage (the survivor)");
  }
  if (!/function DriverEditRedirect/.test(files.manifest) || !/path="\/drivers\/:id\/edit"/.test(files.manifest)) {
    failures.push("RULE 2: /drivers/:id/edit must redirect to ?tab=edit via DriverEditRedirect");
  }
  if (!/DriverProfileAliasRedirect/.test(files.manifest)) {
    failures.push("RULE 2: /drivers/:id/profile must redirect to the surviving profile");
  }

  if (!/parseDriverProfileTab\(searchParams\)/.test(files.board) && !/parseDriverProfileTab\(searchParams\)/.test(files.profile)) {
    failures.push("RULE 3: active tab must parse from URLSearchParams");
  }
  if (/useState<DriverProfileTab>/.test(files.board) || /useState<DriverTab>/.test(files.board)) {
    failures.push("RULE 3: board must not hold the tab in useState");
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
    tabs: `export const DRIVER_PROFILE_STRIP_TABS = [\n  "Overview",\n  "Settlements",\n  "Additional payments",\n  "Cash advances",\n  "Pay & escrow",\n  "Loads",\n  "Fuel",\n  "Reports & damage",\n  "Complaints",\n  "Safety & accidents",\n  "Documents",\n  "Driver disputes",\n] as const;\nexport const DRIVER_PROFILE_MORE_TABS = [\n  "Safety file",\n  "ELD edits",\n  "Legal matters",\n  "QBO mapping",\n  "Audit history",\n] as const;\nexport function parseDriverProfileTab(raw: string | null | URLSearchParams): DriverProfileTab { return "Overview"; }`,
    profile: `const activeTab = parseDriverProfileTab(searchParams);\n`,
    board: `const activeTab = parseDriverProfileTab(searchParams);\nDRIVER_PROFILE_STRIP_TABS.map((label) => label);\nDRIVER_PROFILE_MORE_TABS.map((label) => label);`,
    roster: `onRowClick={(row) => navigate(\`/drivers/\${row.id}\`)}\n<NavyPageSubNav items={DRIVERS_SUBNAV.map((tab) => ({ label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] }))} />\n<SegmentedControl testId="drivers-status-chips" />`,
    manifest: `function DriverDetailRoute() {\n  return <DriverProfilePage />;\n}\nfunction DriverEditRedirect() { return <Navigate to="?tab=edit" />; }\npath="/drivers/:id/edit"\nDriverProfileAliasRedirect`,
  };
  const goodFails = audit(good);
  if (goodFails.length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixture rejected:`);
    for (const f of goodFails) console.error(`  - ${f}`);
    process.exit(1);
  }
  const bad = {
    ...good,
    tabs: `export const DRIVER_PROFILE_STRIP_TABS = ["Overview", "Safety"] as const;\nexport const DRIVER_PROFILE_MORE_TABS = ["X"] as const;\nexport function parseDriverProfileTab(raw: string | null): DriverProfileTab { return "Overview"; }`,
    board: `const [activeTab, setActiveTab] = useState<DriverProfileTab>("Overview");`,
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
console.log(`${LABEL}: OK — approved 12+5 tabs, name-click, URL-sync, one NavyPageSubNav, edit→?tab=edit`);
process.exit(0);
