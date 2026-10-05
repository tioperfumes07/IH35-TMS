#!/usr/bin/env node
/**
 * DRV-F420 / F416 / F421 — tabs stay on the profile, URL-synced, Edit is the form,
 * strip never wraps, form controls carry named width classes.
 *
 * Unnumbered (Rule 37). Claim an EVEN verify-step to main after merge.
 *
 *   node scripts/verify-driver-profile-tabs-stay-on-the-profile.mjs
 *   node scripts/verify-driver-profile-tabs-stay-on-the-profile.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-tabs-stay-on-the-profile";

const PATHS = {
  board: "apps/frontend/src/components/boards/DriverOverviewBoard.tsx",
  tabs: "apps/frontend/src/pages/drivers/driverProfileTabs.ts",
  edit: "apps/frontend/src/pages/drivers/DriverEditForm.tsx",
  css: "apps/frontend/src/components/boards/party-board.css",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};

const WIDTH_CLASSES = ["wd", "wm", "wc", "ws", "wmd", "wl", "wide"];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit(files) {
  const failures = [];

  // RULE 1 — no tab target navigates outside /drivers/:id
  const offProfile = [
    ...files.board.matchAll(/to=\{?["'`]([^"'`]+)["'`]\}?/g),
    ...files.board.matchAll(/to=\{driverProfileTabHref\([^)]+\)\}/g),
  ];
  const hardHrefs = [...files.board.matchAll(/to=["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  for (const href of hardHrefs) {
    if (href.startsWith("/safety") || href === "/drivers/disputes" || href.startsWith("/dispatch")) {
      failures.push(`RULE 1: board tab target leaves the profile: ${href}`);
    }
  }
  if (/\/safety\/complaints/.test(files.board) || /\/drivers\/disputes/.test(files.board)) {
    // "View all" may appear in profile page bodies, never as a strip tab in the board.
    failures.push("RULE 1: DriverOverviewBoard must not hard-link Complaints/Disputes off /drivers/:id");
  }
  if (!/driverProfileTabHref/.test(files.board)) {
    failures.push("RULE 1: strip tabs must use driverProfileTabHref so they stay on /drivers/:id");
  }
  if (!/DRIVER_PROFILE_STRIP_TABS\.map/.test(files.board)) {
    failures.push("RULE 1: strip must map DRIVER_PROFILE_STRIP_TABS");
  }
  if (!/DRIVER_PROFILE_MORE_TABS/.test(files.board)) {
    failures.push("RULE 1: More menu must carry DRIVER_PROFILE_MORE_TABS");
  }

  // RULE 2 — active tab comes from the URL, not useState
  if (!/parseDriverProfileTab\(searchParams\)/.test(files.board)) {
    failures.push("RULE 2: board must parse the active tab from URLSearchParams");
  }
  if (/useState<\s*DriverProfileTab\s*>/.test(files.board) || /useState<\s*DriverTab\s*>/.test(files.board)) {
    failures.push("RULE 2: board must not hold the active tab in useState");
  }
  if (!/export function parseDriverProfileTab\(raw: string \| null \| URLSearchParams\)/.test(files.tabs)) {
    failures.push("RULE 2: parseDriverProfileTab must accept URLSearchParams (parseDriverSubnav shape)");
  }
  if (/to=`#\$\{/.test(files.board) || /href=\{`#/.test(files.board)) {
    failures.push("RULE 2: tabs must not use #hash");
  }

  // RULE 3 — tab strip does not declare flex-wrap (nowrap + overflow-x)
  if (!/\.dd-tabs\s*\{[^}]*flex-wrap:\s*nowrap/.test(files.css)) {
    failures.push("RULE 3: .dd-tabs must declare flex-wrap: nowrap");
  }
  if (/\.dd-tabs\s*\{[^}]*flex-wrap:\s*wrap/.test(files.css)) {
    failures.push("RULE 3: .dd-tabs must not declare flex-wrap: wrap");
  }
  if (/className="dd-tabs[^"]*flex-wrap/.test(files.board)) {
    failures.push("RULE 3: board strip must not add flex-wrap on .dd-tabs");
  }

  // RULE 4 — Edit resolves to the driver-scoped form, not ?tab=profile
  if (!/driverProfileTabHref\([^,]+,\s*"Edit"\)/.test(files.board) && !/tab=edit/.test(files.board)) {
    failures.push("RULE 4: Edit must resolve to ?tab=edit / driverProfileTabHref(..., \"Edit\")");
  }
  if (/tab=profile/.test(files.board) && !/ALIASES/.test(files.tabs)) {
    failures.push("RULE 4: board must not navigate Edit to ?tab=profile");
  }
  if (!/activeTab === "Edit"/.test(files.board) || !/DriverEditForm/.test(files.board)) {
    failures.push("RULE 4: board must render DriverEditForm when activeTab is Edit");
  }
  if (!/Edit:\s*"edit"/.test(files.tabs) && !/Edit: "edit"/.test(files.tabs)) {
    failures.push("RULE 4: DRIVER_PROFILE_TAB_QUERY.Edit must be \"edit\"");
  }

  // RULE 5 — every form control carries one of the named width classes
  const controlLines = files.edit
    .split("\n")
    .filter((line) => /<(input|select|textarea|Combobox)\b/.test(line) || /className=\{`\$\{CTRL\}/.test(line) || /className=\{`\$\{CTRL\} /.test(line));
  const ctrlUsages = [...files.edit.matchAll(/className=\{`\$\{CTRL\}\s+([^`}]+)`\}/g)].map((m) => m[1]);
  const textareaWide = /className="wide/.test(files.edit);
  if (ctrlUsages.length === 0 && !/<input className=\{`\$\{CTRL\}/.test(files.edit)) {
    failures.push("RULE 5: edit form must use CTRL + named width classes on controls");
  }
  for (const usage of ctrlUsages) {
    const hasWidth = WIDTH_CLASSES.some((w) => new RegExp(`\\b${w}\\b`).test(usage));
    if (!hasWidth) {
      failures.push(`RULE 5: control missing named width class: ${usage.trim()}`);
    }
  }
  for (const w of ["wd", "wm", "wc", "ws", "wmd", "wl"]) {
    if (!new RegExp(`\\.${w}\\s*\\{`).test(files.css)) {
      failures.push(`RULE 5: party-board.css must define .${w}`);
    }
  }
  if (!textareaWide && !/\bwide\b/.test(files.edit)) {
    failures.push("RULE 5: notes/textarea must use the wide class");
  }
  if (!/Mexico documents/.test(files.edit) || !/driver-edit-curp/.test(files.edit)) {
    failures.push("RULE 5: Mexico documents group (CURP) must be present on the edit form");
  }
  if (!/Equipment he runs/.test(files.edit) || !/deactivateDriverQualification/.test(files.edit)) {
    failures.push("RULE 5: Equipment he runs must deactivate, never delete");
  }

  // Companion — profile page View-all links may leave the shell; strip must not.
  if (/to=\{`\/safety/.test(files.profile) && !/View all/.test(files.profile)) {
    failures.push("RULE 1 companion: off-profile links on the profile page must be View-all only");
  }

  return failures;
}

function selftest() {
  const good = {
    board: `
      const activeTab = parseDriverProfileTab(searchParams);
      DRIVER_PROFILE_STRIP_TABS.map((label) => (
        <Link to={driverProfileTabHref(id, label)}>{label}</Link>
      ));
      DRIVER_PROFILE_MORE_TABS.map((label) => <Link to={driverProfileTabHref(id, label)} />);
      <Link to={driverProfileTabHref(id, "Edit")}>Edit</Link>
      {activeTab === "Edit" ? <DriverEditForm /> : null}
      <nav className="dd-tabs" />
    `,
    tabs: `
      export const DRIVER_PROFILE_TAB_QUERY = { Edit: "edit" } as const;
      export function parseDriverProfileTab(raw: string | null | URLSearchParams): DriverProfileTab { return "Overview"; }
    `,
    edit: `
      <input className={\`\${CTRL} wd\`} />
      <input className={\`\${CTRL} wm\`} />
      <input className={\`\${CTRL} wc\`} />
      <Combobox className={\`\${CTRL} ws\`} />
      <input className={\`\${CTRL} wmd\`} />
      <input className={\`\${CTRL} wl\`} />
      <textarea className="wide min-h-[88px]" />
      <Group title="Mexico documents"><input data-testid="driver-edit-curp" className={\`\${CTRL} wmd\`} /></Group>
      <Group title="Equipment he runs">{deactivateDriverQualification}</Group>
    `,
    css: `.dd-tabs { display: flex; flex-wrap: nowrap; overflow-x: auto; }
.wd { width: 132px; }
.wm { width: 120px; }
.wc { width: 104px; }
.ws { width: 156px; }
.wmd { width: 200px; }
.wl { width: 268px; }
.wide { width: 100%; }`,
    profile: `<Link to="/safety/complaints">View all</Link>`,
  };
  const goodFails = audit(good);
  if (goodFails.length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixture rejected:`);
    for (const f of goodFails) console.error(`  - ${f}`);
    process.exit(1);
  }

  const bad = {
    board: `
      const [activeTab, setActiveTab] = useState<DriverProfileTab>("Overview");
      <Link to="/safety/complaints">Complaints</Link>
      <Link to="/drivers/disputes">Disputes</Link>
      navigate(\`/drivers/\${id}?tab=profile\`)
      <nav className="dd-tabs flex-wrap" />
    `,
    tabs: `export function parseDriverProfileTab(raw: string | null): DriverProfileTab { return "Overview"; }`,
    edit: `<input className="h-10 w-full" /><Group title="Licence" />`,
    css: `.dd-tabs { display: flex; flex-wrap: wrap; }`,
    profile: `<Link to={\`/safety/complaints\`}>Complaints</Link>`,
  };
  const badFails = audit(bad);
  if (badFails.length < 5) {
    console.error(`${LABEL} SELFTEST FAIL — bad fixture not caught (${badFails.length} failures)`);
    for (const f of badFails) console.error(`  - ${f}`);
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
console.log(`${LABEL}: OK — tabs stay on /drivers/:id, URL-synced, Edit form, nowrap strip, named widths`);
process.exit(0);
