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

// A module link is written bare, to="/accounting/bills", or through the module's href helper,
// to={moneyHref("/accounting/bills")} (ROUND 8.20 return-context wave) — the same parent either way.
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const linkRe = (path, label) =>
  new RegExp(`<Link to=(?:"${esc(path)}"|\\{[A-Za-z_$][\\w$]*Href\\(\\s*"${esc(path)}"\\s*\\)\\})[^>]*>\\s*${label}\\s*<\\/Link>`);
const goBackRe = new RegExp(
  `const goBack = \\(\\) => navigate\\((?:"${esc("/accounting/bills/recurring")}"|[A-Za-z_$][\\w$]*Href\\(\\s*"${esc("/accounting/bills/recurring")}"\\s*\\))\\);`,
);

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function listHasModuleBreadcrumb(src) {
  const legacy =
    /<Link to="\/accounting"[^>]*>\s*Accounting\s*<\/Link>/.test(src) &&
    /<Link to="\/accounting\/bills"[^>]*>\s*Bills\s*<\/Link>/.test(src);
  const viaSubNav =
    /AccountingSubNavWrapper/.test(src) &&
    /title="Recurring Bills"/.test(src) &&
    /label:\s*"Bills"[\s\S]*href:\s*"\/accounting\/bills"/.test(src);
  return legacy || viaSubNav;
}

function audit(listSrc, createSrc) {
  const failures = [];
  const list = stripComments(listSrc);
  const create = stripComments(createSrc);
  if (!listHasModuleBreadcrumb(list)) {
    failures.push(
      `${FILE}: breadcrumb must start at Accounting and link Bills (inline <Link> crumbs or AccountingSubNavWrapper + crumbs + title)`,
    );
  }
  for (const [file, src] of [[CREATE, create]]) {
    if (!linkRe("/accounting", "Accounting").test(src)) failures.push(`${file}: breadcrumb must start at the Accounting home`);
    if (!linkRe("/accounting/bills", "Bills").test(src)) failures.push(`${file}: breadcrumb must link the Bills parent`);
    if (/hasInAppHistory|navigate\(-1\)|history\.back\(/.test(src)) failures.push(`${file}: must not go back through browser history (U18)`);
  }
  if (/hasInAppHistory|navigate\(-1\)|history\.back\(/.test(list)) {
    failures.push(`${FILE}: must not go back through browser history (U18)`);
  }
  if (!linkRe("/accounting/bills/recurring", "Recurring Bills").test(create)) {
    failures.push(`${CREATE}: breadcrumb must link the Recurring Bills parent`);
  }
  if (!goBackRe.test(create)) {
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
    {
      name: "list loses the Accounting crumb",
      list: (t) =>
        t.includes("AccountingSubNavWrapper")
          ? t.replaceAll('title="Recurring Bills"', 'title="Recurring Bills X"')
          : t.replace(/<Link to="\/accounting" /, '<Link to="/home" '),
    },
    { name: "create goes back through history", create: (t) => t.replace(goBackRe, "const goBack = () => navigate(-1);") },
    { name: "create loses the Bills crumb", create: (t) => t.replace(linkRe("/accounting/bills", "Bills"), "<span>Bills</span>") },
    { name: "create's Recurring crumb points elsewhere", create: (t) => t.replace(linkRe("/accounting/bills/recurring", "Recurring Bills"), '<Link to={moneyHref("/accounting")}>Recurring Bills</Link>') },
    {
      name: "list goes back through history",
      list: (t) => `${t}\n<button onClick={() => navigate(-1)}>Back</button>`,
    },
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
