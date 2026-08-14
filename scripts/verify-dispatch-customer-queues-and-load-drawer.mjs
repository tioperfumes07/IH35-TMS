#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer"],"leafRe":"^(home\\.overview|queues\\.(at_risk|detention|late|factoring_queue)|planning\\.(timeline|loads|calendar|reserve)|docs\\.ocr|settings\\.notify)$","task":"LINK-F5165-DISPATCH-CUSTOMER-QUEUES-PLANNERS"} */
/** @matrix-built {"modules":["dispatch"],"cols":["customer"],"leafRe":"^(secondary\\.book_load|dispatch\\.modal\\.book_load_modal_v4|load\\.detail|load\\.drawer\\.(overview|factoring)|dispatch\\.drawer\\.load_detail|dispatch\\.panel\\.pre_dispatch_validation)$","task":"LINK-F5165-DISPATCH-BOOK-LOAD-DRAWER-CUSTOMER"} */
/** @matrix-built {"modules":["dispatch"],"cols":["customer"],"leafRe":"^home\\.list$","task":"LINK-F5165-DISPATCH-BOARD-CUSTOMER"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): every dispatch leaf here
 * genuinely renders EntityLink kind="customer" against a real load/event customer_id, requires a
 * real customer picker on Book Load, or genuinely filters/validates by a real customer_id.
 *
 * Self-test: node scripts/verify-dispatch-customer-queues-and-load-drawer.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  overview: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
  atRisk: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  detention: "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
  late: "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx",
  factoringQueue: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
  timeline: "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
  loadsPlanner: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
  calendar: "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx",
  ocr: "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx",
  notify: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
  bookLoad: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  factoringTab: "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx",
  preDispatch: "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx",
  board: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
};
const LABEL = "verify-dispatch-customer-queues-and-load-drawer";

const ENTITY_LINK_CHECKS = [
  ["overview", /kind="customer" id=\{load\.customer_id\}/],
  ["atRisk", /kind="customer" id=\{load\.customer_id\}/],
  ["detention", /kind="customer" id=\{event\.customer_id\}/],
  ["late", /kind="customer" id=\{load\.customer_id\}/],
  ["factoringQueue", /id=\{row\.customer_id\}/],
  ["timeline", /kind="customer" id=\{load\.customer_id\}/],
  ["loadsPlanner", /kind="customer" id=\{load\.customer_id\}/],
  ["calendar", /kind="customer" id=\{load\.customer_id\}/],
  ["ocr", /kind="customer" id=\{f\.customer_id\}/],
];

export function audit(src) {
  const failures = [];
  for (const [key, pattern] of ENTITY_LINK_CHECKS) {
    if (!pattern.test(src[key])) failures.push(`${FILES[key]}: must render a real EntityLink kind="customer"`);
  }
  if (!/kind="customer"/.test(src.notify) || !/listCustomers/.test(src.notify)) {
    failures.push(`${FILES.notify}: must have a real customer picker (listCustomers) and render EntityLink kind="customer"`);
  }
  if (!/form\.register\("customer_id", \{ required:/.test(src.bookLoad)) {
    failures.push(`${FILES.bookLoad}: Book Load must require a real customer_id field`);
  }
  if (!/kind="customer"[\s\S]{0,50}id=\{load\.customer_id\}/.test(src.drawer)) {
    failures.push(`${FILES.drawer}: Load Detail Drawer Overview must render a real EntityLink kind="customer"`);
  }
  if (!/customer_id: load!\.customer_id/.test(src.factoringTab)) {
    failures.push(`${FILES.factoringTab}: Factoring tab must query invoices scoped by the load's real customer_id`);
  }
  if (!/customer_id: customerId/.test(src.preDispatch)) {
    failures.push(`${FILES.preDispatch}: pre-dispatch validation must submit a real customer_id`);
  }
  if (!/renderCustomerCell/.test(src.board)) {
    failures.push(`${FILES.board}: dispatch board must render a real customer cell`);
  }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ...ENTITY_LINK_CHECKS.map(([key, pattern]) => [`${key}-link`, key, new RegExp(pattern.source, "g"), 'kind="unit"']),
    ["notify-picker", "notify", /listCustomers/g, "listSomethingElse"],
    ["bookload-required", "bookLoad", /form\.register\("customer_id", \{ required:/, 'form.register("customer_id_unused", { required:'],
    ["drawer-link", "drawer", /kind="customer"[\s\S]{0,50}id=\{load\.customer_id\}/, 'kind="unit" id={load.unit_id}'],
    ["factoring-tab-scope", "factoringTab", /customer_id: load!\.customer_id/, "customer_id: undefined"],
    ["predispatch-submit", "preDispatch", /customer_id: customerId/, "customer_id: undefined"],
    ["board-cell", "board", /renderCustomerCell/g, "renderNothingCell"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — dispatch customer queues/planners/book-load/load-drawer wiring is real`);
