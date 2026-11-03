#!/usr/bin/env node
/**
 * verify-rows-53-28.mjs — register rows 53 + 28 (11-03).
 *
 * Row 53 (Reports › Home, board verdict LAYERED): /reports is exactly the v3 board (docs/design/v3/Reports.dc.html) —
 *   KPI strip + category sidebar + ONE right panel. Nothing is stacked under the board (no Management panel, no
 *   Frequently-run panel, no IFTA card below the grid); those stay reachable inside the board (Rule 07):
 *   Management = catalog rows, Frequently run = Saved category, IFTA preparer = Compliance category.
 *   Catalog rows open through real anchors (<Link>/CatalogLink), never <button onClick>.
 *   The 5 report boards of PR #28529 stay in the catalog.
 *
 * Row 28 (all modules, 443.294): ONE OverrideButton + ONE reasons catalog. Every converted override site mounts the
 *   shared <OverrideButton> and carries no free-text override reason box; the onboarding admin override goes through
 *   recordOverride and accepts no typed reason.
 *
 * --selftest plants one defect per rule into in-memory copies and expects each to redden alone.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/frontend/package.json", import.meta.url));
const ts = require("typescript");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-rows-53-28";

export const FILES = {
  board: "apps/frontend/src/pages/reports/components/ReportsHomeBoard.tsx",
  home: "apps/frontend/src/pages/reports/ReportsHome.tsx",
  boards: "apps/frontend/src/pages/reports/boards/reportBoardCatalog.ts",
  overrideButton: "apps/frontend/src/components/override/OverrideButton.tsx",
  validationPanel: "apps/frontend/src/components/shared/ValidationPanel.tsx",
  repair: "apps/frontend/src/pages/dispatch/LoadCreateModal.tsx",
  bookLoad: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  invoice: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
  floor: "apps/frontend/src/pages/driver-finance/components/FloorOverrideDecisionModal.tsx",
  factoring: "apps/frontend/src/pages/factoring/SubmitToFactorTab.tsx",
  onboardingPage: "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx",
  onboardingRoute: "apps/backend/src/safety/onboarding.routes.ts",
};

/** Sites routed through the ONE OverrideButton (row 28) and the override surface each one owns. */
export const OVERRIDE_SITES = ["validationPanel", "repair", "bookLoad", "invoice", "floor", "factoring", "onboardingPage"];

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/**
 * The direct children of the board root (<div data-reports-home-board="1">). The v3 board is exactly three: the
 * error banner slot, the KPI strip, and the two-column grid. Any further child is a section layered under the board.
 */
export function boardRootChildren(boardSrc) {
  const sf = ts.createSourceFile(FILES.board, boardSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let root = null;
  const walk = (n) => {
    if (root) return;
    if (ts.isJsxElement(n) && n.openingElement.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "data-reports-home-board")) {
      root = n;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  if (!root) return null;
  return root.children
    .filter((c) => !(ts.isJsxText(c) && !c.getText(sf).trim()))
    .filter((c) => !(ts.isJsxExpression(c) && (!c.expression || c.getText(sf).replace(/\{\/\*[\s\S]*?\*\/\}/, "").trim() === "")))
    .map((c) => c.getText(sf));
}

export function checkRow53(src) {
  const f = [];
  const board = strip(src.board);
  const children = boardRootChildren(src.board);
  if (children == null) {
    f.push(`${FILES.board}: the board root (data-reports-home-board) is missing`);
  } else {
    const [banner, kpi, grid, ...extra] = children;
    if (!/^\{errored \?/.test(banner ?? "")) f.push(`${FILES.board}: first board child must be the error banner slot`);
    if (!/data-testid="reports-home-kpi-strip"/.test(kpi ?? "")) f.push(`${FILES.board}: second board child must be the KPI strip`);
    if (!/gridTemplateColumns: "200px 1fr"/.test(grid ?? "")) f.push(`${FILES.board}: third board child must be the sidebar + panel grid`);
    if (extra.length) f.push(`${FILES.board}: ${extra.length} section(s) stacked below the board grid (row 53 LAYERED)`);
  }
  if (/title="Management reports"/.test(board)) f.push(`${FILES.board}: a Management reports panel is layered on the Financial view`);
  if (!/\.\.\.MANAGEMENT_ROWS\.map\(/.test(board)) f.push(`${FILES.board}: Management compilations must be catalog rows (Rule 07)`);
  if (!/activeCategory === "saved"[\s\S]{0,900}<FrequentlyRunTable/.test(board)) f.push(`${FILES.board}: Frequently run must live in the Saved category`);
  if (!/activeCategory === "compliance"[\s\S]{0,900}<IftaPreparerCard/.test(board)) f.push(`${FILES.board}: the IFTA preparer must live in the Compliance category`);
  if (!/activeCategory === "automation"[\s\S]{0,120}<ScheduledReportsPanel \/>/.test(board)) f.push(`${FILES.board}: Automation must mount ScheduledReportsPanel`);
  // Catalog rows are anchors.
  if (/<button[^>]*onClick=\{\(\) => (?:openReport|onRun)\(/.test(board)) f.push(`${FILES.board}: a catalog row still opens through a <button onClick>`);
  if (!/<Link\s+to=\{href\}/.test(board) || !/function CatalogLink/.test(board)) f.push(`${FILES.board}: catalog cells must render a real <Link to={href}> anchor`);
  const linkCells = (board.match(/<CatalogLink\b/g) ?? []).length;
  if (linkCells < 5) f.push(`${FILES.board}: expected >= 5 CatalogLink cells (name / Run / Export + category name / Run), found ${linkCells}`);
  // The four working KPI tiles.
  for (const id of ["reports-kpi-available", "reports-kpi-schedules", "reports-kpi-run-7d", "reports-kpi-ifta"]) {
    if (!board.includes(`testId="${id}"`)) f.push(`${FILES.board}: KPI tile ${id} missing`);
  }
  // The 5 report boards (PR #28529) stay in the catalog.
  if (!/REPORT_BOARDS\.map\(/.test(board)) f.push(`${FILES.board}: the 5 report boards (REPORT_BOARDS) left the catalog`);
  for (const id of ["loads-report", "driver-settlements-report", "company-settlements-report", "customer-report", "vendor-report"]) {
    if (!src.boards.includes(`"${id}"`)) f.push(`${FILES.boards}: report board ${id} missing`);
  }
  if (!/<ReportsHomeBoard\b/.test(src.home)) f.push(`${FILES.home}: /reports must mount ReportsHomeBoard`);
  return f;
}

export function checkRow28(src) {
  const f = [];
  const ob = strip(src.overrideButton);
  if (!/export function OverrideButton/.test(ob)) f.push(`${FILES.overrideButton}: the ONE OverrideButton is gone`);
  if (!/OVERRIDE_CONFIRM_ROLES = \["Owner", "Accountant"\]/.test(ob)) f.push(`${FILES.overrideButton}: confirm-only roles must be exactly Owner + Accountant`);
  if (/<textarea|<input\b/.test(ob)) f.push(`${FILES.overrideButton}: the override dialog must not contain a text box`);
  if (!/listOverrideReasons\(/.test(ob)) f.push(`${FILES.overrideButton}: reasons must come from the catalog endpoint`);
  for (const key of OVERRIDE_SITES) {
    const body = strip(src[key]);
    if (!/<OverrideButton\b/.test(body)) f.push(`${FILES[key]}: override site does not mount the shared <OverrideButton>`);
    if (/placeholder="[^"]*(?:[Oo]verride reason|Reason \(min|min 10 char)/.test(body)) {
      f.push(`${FILES[key]}: a free-text override reason box is still rendered`);
    }
    if (/data-testid="(?:repair-block-override-reason|floor-override-reason|blocker-override-reason-)/.test(body)) {
      f.push(`${FILES[key]}: a typed override-reason input testid is still rendered`);
    }
  }
  if (/type="checkbox"[\s\S]{0,200}Override — I acknowledge/.test(strip(src.invoice) + strip(src.bookLoad))) {
    f.push(`credit-limit override is still a checkbox, not the shared OverrideButton`);
  }
  const route = strip(src.onboardingRoute);
  if (!/recordOverride\(client,/.test(route)) f.push(`${FILES.onboardingRoute}: admin override must go through recordOverride`);
  if (/adminOverrideSchema = z\.object\(\{\s*reason: z\.string\(\)/.test(route)) f.push(`${FILES.onboardingRoute}: admin override still accepts a typed reason`);
  return f;
}

function readAll(root = ROOT) {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(root, rel), "utf8")]));
}

export function run(src) {
  return [...checkRow53(src), ...checkRow28(src)];
}

function selftest() {
  const good = readAll();
  const base = run(good);
  if (base.length) {
    console.error(`${LABEL} SELFTEST FAIL — live tree is red:\n  - ${base.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["Frequently run stacked below the board", "board", (s) => s.replace(/(\n\s*<\/div>\n\s*\);\n\}\n\nfunction SimpleCategoryPanel)/, "\n      <V3Panel title=\"Frequently run\"><FrequentlyRunTable rows={[]} onRun={runFrequentReport} /></V3Panel>$1")],
    ["Management panel layered back", "board", (s) => s.replace('title="Accounting &amp; financial"', 'title="Management reports"')],
    ["catalog row back to a button", "board", (s) => s.replace("<CatalogLink href={reportCatalogHref(reportKey, basis)} testId={`reports-acct-link-${reportKey}`}>", '<button type="button" onClick={() => openReport(reportKey)}>').replace("{label}\n        </CatalogLink>", "{label}\n        </button>")],
    ["Link anchor removed", "board", (s) => s.replace("<Link to={href}", "<a")],
    ["report boards dropped from catalog", "board", (s) => s.replace("...REPORT_BOARDS.map(", "...[].map(")],
    ["KPI tile dropped", "board", (s) => s.replace('testId="reports-kpi-run-7d"', 'testId="x"')],
    ["repair override typed again", "repair", (s) => s.replace(/<OverrideButton(?=\s+context=)/g, '<textarea placeholder="Override reason (min 10 chars)" /><X')],
    ["floor override typed again", "floor", (s) => s.replace(/<OverrideButton(?=\s+context=)/g, '<textarea data-testid="floor-override-reason" /><X')],
    ["credit limit checkbox again", "invoice", (s) => s.replace(/<OverrideButton(?=\s+context=)/g, '<input type="checkbox" /><span>Override — I acknowledge</span><X')],
    ["blocker row typed again", "validationPanel", (s) => s.replace(/<OverrideButton(?=\s+context=)/g, '<input placeholder="Reason (min 10 chars)" /><X')],
    ["onboarding bypasses engine", "onboardingRoute", (s) => s.replace("recordOverride(client,", "noop(client,")],
    ["Accountant dropped from confirm roles", "overrideButton", (s) => s.replace('["Owner", "Accountant"]', '["Owner"]')],
  ];
  let ok = 0;
  for (const [name, key, mutate] of plants) {
    const mutated = { ...good, [key]: mutate(good[key]) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — plant "${name}" did not change ${FILES[key]}`);
      process.exit(1);
    }
    if (run(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — plant "${name}" was not caught`);
      process.exit(1);
    }
    ok += 1;
  }
  console.log(`${LABEL} SELFTEST PASS (${ok}/${plants.length})`);
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const failures = run(readAll());
    if (failures.length) {
      console.error(`${LABEL} FAIL:\n  - ${failures.join("\n  - ")}`);
      process.exit(1);
    }
    console.log(`${LABEL} PASS — Reports Home is the board (rows link, nothing layered); ${OVERRIDE_SITES.length} override sites on the ONE OverrideButton`);
  }
}
