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
 *   recordOverride and accepts no typed reason. FINISH (11-03): the dispatch booking overrides (hard-block / HOS /
 *   locked-load / unit-repair / DOT), the settlement net-pay floor, the invoice credit limit, the 425C carry-forward and the
 *   Reclassify refused-class override ALL record through recordOverride in their own transaction and REFUSE typed text;
 *   the Book Load hard-block is Owner / Accountant confirm (Administrator kept); 425C + Reclassify use the shared button.
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
  // Row 28 finish (11-03): the three screens that still bypassed the shared button, and the server routes that stored the
  // catalog line without calling recordOverride.
  form425cTab: "apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx",
  form425cHome: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
  reclassifyPage: "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx",
  confirmOverride: "apps/backend/src/overrides/confirm-override.ts",
  dispatchOverride: "apps/backend/src/dispatch/dispatch-override.ts",
  bookLoadService: "apps/backend/src/dispatch/book-load.service.ts",
  updateLoadService: "apps/backend/src/dispatch/update-load.service.ts",
  loadsRoutes: "apps/backend/src/dispatch/loads.routes.ts",
  payrunCloseService: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  payrunCloseRoutes: "apps/backend/src/driver-finance/settlement-payrun-close.routes.ts",
  invoicesRoutes: "apps/backend/src/accounting/invoices.routes.ts",
  form425cRoutes: "apps/backend/src/compliance/form-425c.routes.ts",
  reclassifyService: "apps/backend/src/accounting/reclassify/reclassify.service.ts",
  reclassifyRoutes: "apps/backend/src/accounting/reclassify/reclassify.routes.ts",
  seed425c: "db/migrations/202616350100_override_reasons_425c_carry_forward.sql",
};

/** Sites routed through the ONE OverrideButton (row 28) and the override surface each one owns. */
export const OVERRIDE_SITES = ["validationPanel", "repair", "bookLoad", "invoice", "floor", "factoring", "onboardingPage", "form425cTab", "reclassifyPage"];

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
    if (/Override Reason \(required for carry-forward|<textarea[^>]*projectionOverrideReason/.test(body)) {
      f.push(`${FILES[key]}: the 425C carry-forward override is a typed reason box again`);
    }
    if (/type="checkbox"[^>]*overrideRefusals|setOverrideRefusals\(e\.target\.checked\)/.test(body)) {
      f.push(`${FILES[key]}: the Reclassify owner override is a checkbox again`);
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
  if (!/const canOverrideHardBlock = \["Owner", "Accountant", "Administrator"\]/.test(strip(src.bookLoad))) f.push(`${FILES.bookLoad}: the Book Load hard-block override must be Owner / Accountant confirm (Administrator kept)`);
  if (!/context="425c_carry_forward"/.test(strip(src.form425cTab))) f.push(`${FILES.form425cTab}: the carry-forward override must be <OverrideButton context="425c_carry_forward">`);
  if (/projection_override_reason:/.test(strip(src.form425cHome))) f.push(`${FILES.form425cHome}: the 425C save still sends a typed projection_override_reason`);
  if (!/context="expense"/.test(strip(src.reclassifyPage))) f.push(`${FILES.reclassifyPage}: the Reclassify override must be the shared <OverrideButton>`);
  f.push(...checkRow28Server(src));
  return f;
}

/**
 * Row 28 finish — every override route records through recordOverride IN ITS TRANSACTION and refuses typed text:
 * dispatch booking (hard-block / HOS / locked-load / unit-repair / DOT), settlement net-pay floor, invoice credit limit,
 * 425C carry-forward, Reclassify refused classes. (Driver duplicate merge is deliberately NOT an override: it is an
 * Owner-only consolidation whose only reason is already picked from the void-reasons catalog.)
 */
export function checkRow28Server(src) {
  const f = [];
  const eng = strip(src.confirmOverride);
  if (!/recordOverride\(client,/.test(eng)) f.push(`${FILES.confirmOverride}: confirmOverride must call the ONE engine (recordOverride)`);
  if (!/refusedTypedReason/.test(eng)) f.push(`${FILES.confirmOverride}: the refused-typed-reason schema helper is gone`);
  const disp = strip(src.dispatchOverride);
  if (!/context: "dispatch"/.test(disp) || !/confirmOverride\(/.test(disp)) f.push(`${FILES.dispatchOverride}: dispatch overrides must confirm through confirmOverride, context dispatch`);
  if (!/override_reason: refusedTypedReason\(/.test(disp) || !/reason: refusedTypedReason\(/.test(disp)) f.push(`${FILES.dispatchOverride}: the typed override_reason / rule reason must be REFUSED on the wire`);
  const book = strip(src.bookLoadService);
  const bookCalls = (book.match(/confirmDispatchOverride\(client,/g) ?? []).length;
  if (bookCalls < 5) f.push(`${FILES.bookLoadService}: expected >= 5 recordOverride confirms (unit-block, OOS, HOS, DOT qualification, unit-repair), found ${bookCalls}`);
  if (/override_reason\.trim\(\)\.length < 10|!input\.override_reason \|\|/.test(book)) f.push(`${FILES.bookLoadService}: a booking gate still demands a typed 10-char reason`);
  if (!/function canOverrideUnitBlock\(role: string\) \{\s*return role === "Owner" \|\| role === "Accountant"/.test(book)) f.push(`${FILES.bookLoadService}: the hard-block (unit / OOS) override must be Owner / Accountant confirm`);
  const upd = strip(src.updateLoadService);
  const updCalls = (upd.match(/confirmDispatchOverride\(client,/g) ?? []).length;
  if (updCalls < 2) f.push(`${FILES.updateLoadService}: expected >= 2 recordOverride confirms (locked-load, DOT qualification), found ${updCalls}`);
  const lr = strip(src.loadsRoutes);
  if (!/\.\.\.dispatchOverrideWireShape/.test(lr)) f.push(`${FILES.loadsRoutes}: the booking body must use dispatchOverrideWireShape (catalog code, typed reason refused)`);
  if (/(?<![_a-z])override_reason: z\.string\(\)/.test(lr)) f.push(`${FILES.loadsRoutes}: a booking body still accepts a typed override_reason`);
  const pcs = strip(src.payrunCloseService);
  if (!/confirmOverride\(client as never, \{\s*context: "settlement"/.test(pcs)) f.push(`${FILES.payrunCloseService}: the net-pay floor override must call recordOverride (context settlement)`);
  const pcr = strip(src.payrunCloseRoutes);
  if (!/reason_code: overrideReasonCodeSchema/.test(pcr) || !/reason: refusedTypedReason\(/.test(pcr)) f.push(`${FILES.payrunCloseRoutes}: override_floor must take a catalog reason_code and refuse typed text`);
  const inv = strip(src.invoicesRoutes);
  const invCalls = (inv.match(/confirmOverride\(client as never, \{\s*context: "invoice"/g) ?? []).length;
  if (invCalls < 2) f.push(`${FILES.invoicesRoutes}: both credit-limit override sites must call recordOverride (context invoice), found ${invCalls}`);
  if (/"accounting\.invoices\.credit_limit_override"/.test(inv)) f.push(`${FILES.invoicesRoutes}: the credit-limit override still audits by hand instead of recordOverride`);
  const c425 = strip(src.form425cRoutes);
  if (!/context: "425c_carry_forward"/.test(c425)) f.push(`${FILES.form425cRoutes}: the carry-forward override must call recordOverride (context 425c_carry_forward)`);
  if (/projection_override_reason: z\.string\(\)|min_30_chars/.test(c425)) f.push(`${FILES.form425cRoutes}: the carry-forward override still demands 30 typed characters`);
  const rcs = strip(src.reclassifyService);
  if (!/confirmOverride\(client as never, \{\s*context: "expense"/.test(rcs)) f.push(`${FILES.reclassifyService}: the Reclassify override must call recordOverride`);
  if (/actor\.role !== "Owner"\) throw new Error\("reclassify_override_owner_only"\)/.test(rcs)) f.push(`${FILES.reclassifyService}: the Reclassify override is Owner-only again (rule: Owner / Accountant confirm)`);
  if (!/override_reason_code: overrideReasonCodeSchema/.test(strip(src.reclassifyRoutes))) f.push(`${FILES.reclassifyRoutes}: the Reclassify body must take a catalog reason_code`);
  const seed = src.seed425c;
  if (!/'425c_carry_forward'/.test(seed) || !/ON CONFLICT \(operating_company_id, reason_code\) DO NOTHING/.test(seed)) f.push(`${FILES.seed425c}: the 425C seed must be idempotent (ON CONFLICT DO NOTHING) and carry the 425c_carry_forward context`);
  if (!/owner_override', 'accountant_override'/.test(seed)) f.push(`${FILES.seed425c}: the role_only owner / accountant rows must gain the 425c context or a plain confirm is refused`);
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
    ["Management panel layered back", "board", (s) => s.replace(/title="Accounting (?:&amp;|&) financial"/, 'title="Management reports"')],
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
    ["425C carry-forward back to a typed box", "form425cTab", (s) => s.replace(/<OverrideButton(?=\s+context=)/g, '<textarea>Override Reason (required for carry-forward overrides)</textarea><X')],
    ["Reclassify override back to a checkbox", "reclassifyPage", (s) => s.replace(/<OverrideButton(?=\s+context=)/g, '<input type="checkbox" onChange={(e) => setOverrideRefusals(e.target.checked)} /><X')],
    ["425C home sends a typed reason again", "form425cHome", (s) => s.replace("projection_override_confirmed:", "projection_override_reason: form.projectionOverrideReason, projection_override_confirmed:")],
    ["Book Load hard-block back to Owner/Administrator", "bookLoad", (s) => s.replace('["Owner", "Accountant", "Administrator"].includes', '["Owner", "Administrator"].includes')],
    ["unit-block override back to Owner-only", "bookLoadService", (s) => s.replace('return role === "Owner" || role === "Accountant" || role === "Administrator";', 'return role === "Owner";')],
    ["HOS gate bypasses recordOverride", "bookLoadService", (s) => s.replace("const hosOverride = await confirmDispatchOverride(client,", "const hosOverride = await noopConfirm(client,")],
    ["booking gate demands typed text again", "bookLoadService", (s) => s.replace("const oosOverride = await confirmDispatchOverride(client, {", "if (!input.override_reason || input.override_reason.trim().length < 10) return { kind: \"error\", status: 400, payload: {} };\n        const oosOverride = await confirmDispatchOverride(client, {")],
    ["locked-load override bypasses recordOverride", "updateLoadService", (s) => s.replace("const lockOverride = await confirmDispatchOverride(client,", "const lockOverride = await noopConfirm(client,")],
    ["booking route accepts a typed override_reason", "loadsRoutes", (s) => s.replace("...dispatchOverrideWireShape,", "override_reason: z.string(),")],
    ["dispatch wire shape stops refusing typed text", "dispatchOverride", (s) => s.replace('override_reason: refusedTypedReason("override_reason")', "override_reason: z.string().optional()")],
    ["settlement floor bypasses recordOverride", "payrunCloseService", (s) => s.replace('context: "settlement"', 'context: "expense"').replace("confirmOverride(client as never, {", "noopConfirm(client as never, {")],
    ["settlement floor route accepts typed reason", "payrunCloseRoutes", (s) => s.replace('reason: refusedTypedReason("override_floor.reason")', "reason: z.string().optional()")],
    ["invoice credit limit audits by hand again", "invoicesRoutes", (s) => s.replace('context: "invoice"', 'context: "bill"').replace('context: "bill"', 'context: "invoice"').replace(/confirmOverride\(client as never, \{\s*context: "invoice"/, "noopConfirm(client as never, { context: \"invoice\"")],
    ["425C route demands 30 typed chars again", "form425cRoutes", (s) => s.replace('context: "425c_carry_forward"', 'context: "factoring"') + "\nconst legacy = 'projection_override_reason_required_min_30_chars';"],
    ["Reclassify override Owner-only again", "reclassifyService", (s) => s.replace('actor.role !== "Owner" && actor.role !== "Accountant"', 'actor.role !== "Owner"') + "\nif (overrideRefusals && actor.role !== \"Owner\") throw new Error(\"reclassify_override_owner_only\");"],
    ["425C seed not idempotent", "seed425c", (s) => s.replace("(operating_company_id, reason_code) DO NOTHING", "(operating_company_id, reason_code) DO UPDATE SET label_en = EXCLUDED.label_en")],
    ["425C role rows not widened", "seed425c", (s) => s.replace("'owner_override', 'accountant_override'", "'owner_approved'")],
    ["engine stops being called", "confirmOverride", (s) => s.replace("recordOverride(client,", "noop(client,")],
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
    console.log(`${LABEL} PASS — Reports Home is the board (rows link, nothing layered); ${OVERRIDE_SITES.length} override sites on the ONE OverrideButton; every override route records through recordOverride`);
  }
}
