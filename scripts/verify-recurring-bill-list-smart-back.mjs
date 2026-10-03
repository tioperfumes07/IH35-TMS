#!/usr/bin/env node
/**
 * Recurring bills — the way back.
 * History: UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY (GO-1540) made the recurring-bill Back arrows prefer browser
 * history. U18 (owner UI register 2026-10-03) reversed that rule app-wide: "Back is browser history — becomes a
 * breadcrumb, parent always the module home". Both recurring pages keep a visible way back, and it is the module path:
 *   - RecurringBillList: Accounting / Bills / Recurring Bills (links to /accounting and /accounting/bills)
 *   - RecurringBillCreate: Accounting / Bills / Recurring Bills / Create; Cancel returns to /accounting/bills/recurring
 *   - neither goes back through browser history
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx";
const CREATE = "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(listSrc, createSrc) {
  const failures = [];
  const list = stripComments(listSrc);
  const create = stripComments(createSrc);
  for (const [file, src] of [[FILE, list], [CREATE, create]]) {
    if (!/<Link to="\/accounting"[^>]*>\s*Accounting\s*<\/Link>/.test(src)) failures.push(`${file}: breadcrumb must start at the Accounting home`);
    if (!/<Link to="\/accounting\/bills"[^>]*>\s*Bills\s*<\/Link>/.test(src)) failures.push(`${file}: breadcrumb must link the Bills parent`);
    if (/hasInAppHistory|navigate\(-1\)|history\.back\(/.test(src)) failures.push(`${file}: must not go back through browser history (U18)`);
  }
  if (!/<Link to="\/accounting\/bills\/recurring"[^>]*>\s*Recurring Bills\s*<\/Link>/.test(create)) {
    failures.push(`${CREATE}: breadcrumb must link the Recurring Bills parent`);
  }
  if (!/const goBack = \(\) => navigate\("\/accounting\/bills\/recurring"\);/.test(create)) {
    failures.push(`${CREATE}: Cancel must return to the recurring-bill list (the parent), not history`);
  }
  return failures;
}

const listSource = fs.readFileSync(FILE, "utf8");
const createSource = fs.readFileSync(CREATE, "utf8");
const failures = audit(listSource, createSource);

if (failures.length) {
  console.error(`verify-recurring-bill-list-smart-back FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "list loses the Accounting crumb", list: (t) => t.replace(/<Link to="\/accounting" /, '<Link to="/home" ') },
    { name: "create goes back through history", create: (t) => t.replace('const goBack = () => navigate("/accounting/bills/recurring");', "const goBack = () => navigate(-1);") },
    { name: "list goes back through history", list: (t) => t.replace("</Link>", "</Link><button onClick={() => navigate(-1)}>Back</button>") },
  ];
  let caught = 0;
  for (const m of mutations) {
    const l = m.list ? m.list(listSource) : listSource;
    const c = m.create ? m.create(createSource) : createSource;
    if (l === listSource && c === createSource) throw new Error(`mutation "${m.name}" did not change source -- inert`);
    if (audit(l, c).length === 0) throw new Error(`mutation escaped: "${m.name}" was not caught`);
    caught++;
  }
  console.log(`verify-recurring-bill-list-smart-back SELFTEST PASS — ${caught}/${mutations.length} mutations caught`);
  process.exit(0);
}

console.log("verify-recurring-bill-list-smart-back PASS — recurring bills go back by the module breadcrumb (Accounting / Bills / Recurring Bills), never browser history (U18)");
