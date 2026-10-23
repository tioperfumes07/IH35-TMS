#!/usr/bin/env node
/** 443.280: approved boards replace legacy bodies; preserved workflows belong to other routes. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../apps/frontend/package.json", import.meta.url));
const ts = require("typescript");
const files = {
  safety: "apps/frontend/src/pages/safety/tabs/DriverFilesTab.tsx",
  maintenance: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  overview: "apps/frontend/src/components/boards/DriverOverviewBoard.tsx",
};
export function inspectBoards(sources) {
  const failures = [];
  const parse = key => ts.createSourceFile(files[key], sources[key], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function walk(node, fn) { fn(node); ts.forEachChild(node, child => walk(child, fn)); }
  function mounts(node, source, banned) {
    const aliases = new Map();
    walk(source, n => {
      if (ts.isImportSpecifier(n)) aliases.set(n.name.text, n.propertyName?.text ?? n.name.text);
    });
    walk(node, n => {
      if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return;
      const name = n.tagName.getText(source);
      const canonical = aliases.get(name) ?? name.split(".").at(-1);
      if (banned.includes(canonical)) failures.push(`${source.fileName}: legacy ${canonical} mounted on board`);
    });
  }
  const safety = parse("safety");
  const safetyBanned = ["details", "DriverSafetyCards", "DriversListPage", "TrainingRecordsSection", "TrainingTab"];
  mounts(safety, safety, safetyBanned);
  walk(safety, n => {
    if (ts.isImportSpecifier(n) && safetyBanned.includes(n.propertyName?.text ?? n.name.text)) failures.push(`${safety.fileName}: legacy import ${n.getText(safety)}`);
  });
  const maintenance = parse("maintenance");
  for (const [condition, banned] of [
    ['tab === "rm_status_board"', ["details", "IntegrationsStrip", "RMBucketsGrid", "RMStatStrip", "ArrivingSoonPage", "PredictiveAlertsPage", "DtcAutoWorkOrdersCard", "RoadServiceActivePanel"]],
    ["isInShopBoard", ["details", "MaintKpiRows", "MaintenancePmCountdownCards", "MaintenanceAlertsCard", "DtcAutoWorkOrdersCard", "FleetTablePage", "RecentActivityRow"]],
  ]) {
    const blocks = [];
    walk(maintenance, n => { if (ts.isConditionalExpression(n) && n.condition.getText(maintenance) === condition) blocks.push(n.whenTrue); });
    if (blocks.length !== 1) failures.push(`${maintenance.fileName}: expected one ${condition} board, found ${blocks.length}`);
    blocks.forEach(block => mounts(block, maintenance, banned));
  }
  if (!sources.maintenance.includes('!isHomeTab && !isInShopBoard && tab !== "settings"')) failures.push("In Shop legacy KPI shell is not excluded");
  if (!sources.maintenance.includes("!isInShopBoard && (recentQuery.isError")) failures.push("In Shop recent activity shell is not excluded");
  const profile = parse("profile");
  let liveOverviewWired = false;
  walk(profile, n => {
    if ((!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) || n.tagName.getText(profile) !== "DriverOverviewBoard") return;
    const prop = n.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(profile) === "compactOverview");
    if (prop?.initializer) walk(prop.initializer, child => {
      if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && child.tagName.getText(profile) === "DriverLiveOverview") liveOverviewWired = true;
    });
  });
  if (!liveOverviewWired) failures.push("Driver Profile must wire DriverLiveOverview into compactOverview");
  mounts(profile, profile, ["details"]);
  walk(profile, n => {
    if (ts.isConditionalExpression(n) && n.condition.getText(profile) === 'activeTab === "Overview"') failures.push(`${profile.fileName}: legacy page-level Overview body restored`);
  });
  const overview = parse("overview");
  let landing;
  walk(overview, n => {
    if (ts.isIfStatement(n) && n.expression.getText(overview) === 'activeTab === "Overview" && props.compactOverview != null') landing = n.thenStatement;
  });
  if (!landing || !landing.getText(overview).includes("return")) failures.push("Driver compact landing must return before legacy overview");
  else mounts(landing, overview, ["details", "CollapsibleProfileCard", "DriverSafetyCards", "DriverOverviewBoard"]);
  if (!sources.overview.includes('enabled: activeTab !== "Edit" && !(activeTab === "Overview" && props.compactOverview != null)')) failures.push("Driver landing still fetches the legacy overview");
  return failures;
}
export function selftest() {
  const clean = {
    safety: "export const Page = () => <DriverFilesMatrix />;",
    maintenance: 'const Home = tab === "rm_status_board" ? <Board /> : null; const Shop = isInShopBoard ? <InShopBoard /> : null; const KPI = !isHomeTab && !isInShopBoard && tab !== "settings" ? <MaintKpiRows /> : null; const recent = !isInShopBoard && (recentQuery.isError ? <Error /> : <RecentActivityRow />);',
    profile: 'const Page = activeTab === "Operations" ? <History /> : <DriverOverviewBoard compactOverview={<DriverLiveOverview />} />;',
    overview: 'const query = {enabled: activeTab !== "Edit" && !(activeTab === "Overview" && props.compactOverview != null)}; function Board() { if (activeTab === "Overview" && props.compactOverview != null) { return <>{props.compactOverview}</>; } return <Legacy />; }',
  };
  if (inspectBoards(clean).length) throw new Error("clean selftest rejected");
  const plants = [
    ["safety", '<details><DriverSafetyCards /></details>'],
    ["safety", 'import {DriversListPage as Hidden} from "x"; const Page = () => <Hidden />;'],
    ["maintenance", clean.maintenance.replace("<Board />", "<details><RMBucketsGrid /></details>")],
    ["maintenance", clean.maintenance.replace("<InShopBoard />", "<><InShopBoard /><FleetTablePage /></>")],
    ["maintenance", clean.maintenance.replace("!isInShopBoard && (recentQuery", "true && (recentQuery")],
    ["profile", clean.profile.replace('activeTab === "Operations"', 'activeTab === "Overview"')],
    ["profile", clean.profile.replace('compactOverview={<DriverLiveOverview />}', '')],
    ["overview", clean.overview.replace("{props.compactOverview}</>", "{props.compactOverview}<details><CollapsibleProfileCard /></details></>")],
    ["overview", clean.overview.replace('enabled: activeTab !== "Edit" && !(activeTab === "Overview" && props.compactOverview != null)', "enabled: true")],
  ];
  for (const [key, value] of plants) if (!inspectBoards({ ...clean, [key]: value }).length) throw new Error(`plant escaped: ${key}`);
  console.log(`verify-board-page-no-legacy-sections selftest PASS ${plants.length + 1}/${plants.length + 1}`);
}
export function run(root = process.cwd()) {
  const sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
  const failures = inspectBoards(sources);
  failures.forEach(failure => console.error(failure));
  console.log(`verify-board-page-no-legacy-sections: ${failures.length ? "FAIL" : "PASS"} (${failures.length} findings)`);
  if (failures.length) throw new Error(`Board legacy sections: ${failures.length} findings`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.includes("--selftest")) selftest(); else run(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
