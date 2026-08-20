#!/usr/bin/env node
/** @matrix-built {"modules":["compliance","docs","driver-hub","form_425","tasks","program","system"],"cols":["connectivity"],"leafRe":"^(home|tab\\.(filings|overview|hos_tracker|hos_viewer|violations|hos_history|required_docs|all|driver|customer|vendor|unit|equipment|scheduler|leave_requests|profile|form|merge|history|program|software|claude_coder)|nav\\.(board|mine|calendar|chat|report|scenario|matrix|legacy|tracker|modules|final))$","task":"LINK-F5155-PRIMARY-MODULE-NAVIGATION-CONNECTIVITY","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  compliance: "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx",
  docs: "apps/frontend/src/pages/docs/DocsHomePage.tsx",
  driverHub: "apps/frontend/src/pages/home/DriverHubPage.tsx",
  form425: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
  form425Exhibits: "apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx",
  tasks: "apps/frontend/src/pages/tasks/TasksModuleTabs.tsx",
  program: "apps/frontend/src/pages/program/ProgramModuleNav.tsx",
  system: "apps/frontend/src/pages/system/SystemModulePage.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  complianceMatrix: "docs/specs/scoreboard/modules/compliance.required.json",
  docsMatrix: "docs/specs/scoreboard/modules/docs.required.json",
  driverHubMatrix: "docs/specs/scoreboard/modules/driver-hub.required.json",
  form425Matrix: "docs/specs/scoreboard/modules/form_425.required.json",
  tasksMatrix: "docs/specs/scoreboard/modules/tasks.required.json",
  programMatrix: "docs/specs/scoreboard/modules/program.required.json",
  systemMatrix: "docs/specs/scoreboard/modules/system.required.json",
};

const EXPECTED = {
  compliance: ["filings", "overview", "hos_tracker", "hos_viewer", "violations", "hos_history", "required_docs"],
  docs: ["all", "driver", "customer", "vendor", "unit", "equipment"],
  driverHub: ["overview", "scheduler", "leave_requests"],
  form425: ["profile", "form", "merge", "history"],
  tasks: ["board", "mine", "calendar", "chat", "report"],
  program: ["scenario", "matrix", "legacy", "tracker", "modules", "final"],
  system: ["overview", "program", "software", "claude-coder"],
};

const REQUIRED_LEAVES = {
  complianceMatrix: EXPECTED.compliance.map((id) => `tab.${id}`),
  docsMatrix: ["home", ...EXPECTED.docs.map((id) => `tab.${id}`)],
  driverHubMatrix: ["home", ...EXPECTED.driverHub.map((id) => `tab.${id}`)],
  form425Matrix: ["home", ...EXPECTED.form425.map((id) => `tab.${id}`)],
  tasksMatrix: EXPECTED.tasks.map((id) => `nav.${id}`),
  programMatrix: ["nav.scenario", "nav.final"],
  systemMatrix: ["home", ...EXPECTED.system.map((id) => `tab.${id.replaceAll("-", "_")}`)],
};

const ROUTES = [
  "/compliance", "/docs", "/driver-hub", "/425c", "/tasks", "/tasks/mine", "/tasks/calendar",
  "/tasks/chat", "/tasks/report", "/program", "/program/matrix", "/program/legacy-scoreboard",
  "/program/tracker", "/program/modules", "/program/final-additions", "/system",
];

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };

  for (const id of EXPECTED.compliance) need("compliance", `id: "${id}"`, `compliance tab ${id} must remain visible`);
  need("compliance", "onClick={() => setTab(t.id)}", "compliance tabs must change the canonical query state");
  for (const id of EXPECTED.docs) need("docs", `id: "${id}"`, `docs tab ${id} must remain visible`);
  need("docs", "setActiveTab(next as DocsEntityTabId)", "docs tabs must change the canonical entity filter");
  for (const id of EXPECTED.driverHub) need("driverHub", `id: "${id}"`, `driver-hub tab ${id} must remain visible`);
  need("driverHub", "<SecondaryNavTabs tabs={TABS}", "driver-hub tabs must render through shared navigation");
  for (const id of EXPECTED.form425) need("form425", `id: "${id}"`, `form 425C tab ${id} must remain visible`);
  need("form425", "tabs={TABS.map", "form 425C tabs must render through shared navigation");
  need("form425Exhibits", "for the selected operating company", "form 425C exhibits must describe the active company scope");
  if (/\bTRANSP\b/.test(source.form425Exhibits)) failures.push("form 425C exhibits must not hardcode TRANSP while another company is active");
  for (const id of EXPECTED.tasks) need("tasks", `id: "${id}"`, `tasks nav ${id} must remain visible`);
  need("tasks", "onClick={() => navigate(tab.to)}", "tasks navigation must open its mounted routes");
  for (const id of EXPECTED.program) need("program", `program-nav-${id}`, `program nav ${id} must remain visible`);
  for (const id of EXPECTED.system) need("system", `id: "${id}"`, `system tab ${id} must remain visible`);
  need("system", "const visibleTabs = SYSTEM_TABS.filter", "system tabs must retain the feature-aware visible-tab projection");
  need("system", "<SecondaryNavTabs tabs={visibleTabs.map", "system tabs must render through shared navigation");

  for (const route of ROUTES) need("routes", `path="${route}"`, `route ${route} must remain mounted`);
  for (const [key, ids] of Object.entries(REQUIRED_LEAVES)) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${key}:${id} must inventory connectivity`);
    }
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("primary module navigation connectivity guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--self-test") || process.argv.includes("--selftest")) {
  const mutations = [
    ["compliance", 'id: "filings"', 'id: "filings-broken"'],
    ["compliance", "onClick={() => setTab(t.id)}", "onClick={() => undefined}"],
    ["docs", 'id: "all"', 'id: "all-broken"'],
    ["docs", "setActiveTab(next as DocsEntityTabId)", "setPage(1)"],
    ["driverHub", 'id: "scheduler"', 'id: "scheduler-broken"'],
    ["driverHub", "<SecondaryNavTabs tabs={TABS}", "<SecondaryNavTabs tabs={[]}"],
    ["form425", 'id: "form"', 'id: "form-broken"'],
    ["form425", "tabs={TABS.map", "tabs={[].map"],
    ["form425Exhibits", "for the selected operating company", "for TRANSP monthly DIP filings"],
    ["tasks", 'id: "board"', 'id: "board-broken"'],
    ["tasks", "onClick={() => navigate(tab.to)}", "onClick={() => undefined}"],
    ["program", "program-nav-matrix", "broken-program-matrix"],
    ["program", "program-nav-final", "broken-program-final"],
    ["system", 'id: "program"', 'id: "program-broken"'],
    ["system", "const visibleTabs = SYSTEM_TABS.filter", "const visibleTabs = [].filter"],
    ["system", "<SecondaryNavTabs tabs={visibleTabs.map", "<SecondaryNavTabs tabs={[].map"],
    ["routes", 'path="/tasks/calendar"', 'path="/tasks/calendar-broken"'],
    ["routes", 'path="/program/matrix"', 'path="/program/matrix-broken"'],
    ["routes", 'path="/system"', 'path="/system-broken"'],
    ["complianceMatrix", '"id": "tab.filings"', '"id": "tab.filings.broken"'],
    ["docsMatrix", '"id": "home"', '"id": "home.broken"'],
    ["driverHubMatrix", '"id": "tab.scheduler"', '"id": "tab.scheduler.broken"'],
    ["form425Matrix", '"id": "tab.form"', '"id": "tab.form.broken"'],
    ["tasksMatrix", '"id": "nav.board"', '"id": "nav.board.broken"'],
    ["programMatrix", '"id": "nav.scenario"', '"id": "nav.scenario.broken"'],
    ["systemMatrix", '"id": "tab.program"', '"id": "tab.program.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted navigation defects were rejected`);
}

console.log("PASS: 39 exact non-QBO primary navigation leaves remain mounted and operator-reachable");
