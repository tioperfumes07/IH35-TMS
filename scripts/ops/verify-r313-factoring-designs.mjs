#!/usr/bin/env node
/**
 * R313 Cursor item 2 — Factoring designs chrome.
 * Asserts /factoring home advances + aging-by-factor + /factoring/advances/:id drawer +
 * /factoring/statements tie-out shell + EntityLink retarget + both-way load/bank wire surface.
 * Static only. Self-test: node scripts/ops/verify-r313-factoring-designs.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-r313-factoring-designs";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(problems) {
  console.error(`${LABEL} FAIL — ${problems.join("; ")}`);
  process.exit(1);
}

function check() {
  const problems = [];
  const home = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
  if (!/\{ id: "advances", label: "Advances" \}/.test(home)) problems.push("FactoringHome SUBNAV missing advances");
  if (!/tab === "advances"/.test(home)) problems.push("FactoringHome missing advances panel");
  if (!/factoring-aging-by-factor/.test(home)) problems.push("FactoringHome missing aging-by-factor");
  if (!/agingByFactor/.test(home)) problems.push("FactoringHome missing agingByFactor grouping");

  const drawer = read("apps/frontend/src/pages/factoring/FactoringAdvanceDrawer.tsx");
  if (!/kind="load"/.test(drawer)) problems.push("AdvanceDrawer missing load EntityLink");
  if (!/kind="invoice"/.test(drawer)) problems.push("AdvanceDrawer missing invoice EntityLink");
  if (!/kind="bank_transaction"/.test(drawer)) problems.push("AdvanceDrawer missing bank_transaction EntityLink");
  if (!/factoring-advance-drawer-body/.test(drawer)) problems.push("AdvanceDrawer missing testid body");

  const statements = read("apps/frontend/src/pages/factoring/StatementsTieOutPage.tsx");
  if (!/factoring-statements-tieout-page/.test(statements)) problems.push("StatementsTieOutPage missing page testid");
  if (!/factoring-statements-file-input/.test(statements)) problems.push("StatementsTieOutPage missing upload chrome");
  if (!/factor\.faro_statement_lines/.test(statements)) problems.push("StatementsTieOutPage must name CC-2 engine table");

  const entityLink = read("apps/frontend/src/components/shared/EntityLink.tsx");
  if (!/return `\/factoring\/advances\/\$\{id\}`/.test(entityLink)) {
    problems.push("EntityLink factoring_advance must resolve to /factoring/advances/:id");
  }

  const routes = read("apps/frontend/src/routes/manifest.tsx");
  if (!/path="\/factoring\/advances\/:id"/.test(routes)) problems.push("manifest missing /factoring/advances/:id");
  if (!/path="\/factoring\/advances"/.test(routes)) problems.push("manifest missing /factoring/advances");
  if (!/path="\/factoring\/statements"/.test(routes)) problems.push("manifest missing /factoring/statements");
  if (!/FactoringAdvanceDrawerRoute/.test(routes)) problems.push("manifest missing FactoringAdvanceDrawerRoute");

  const tabPath = read("apps/frontend/src/router/route-manifest.ts");
  if (!/advances: "\/factoring\/advances"/.test(tabPath)) problems.push("FACTORING_TAB_PATH.advances missing");
  if (!/statements: "\/factoring\/statements"/.test(tabPath)) problems.push("FACTORING_TAB_PATH.statements missing");

  const detail = read("apps/frontend/src/pages/accounting/FactoringDetailPage.tsx");
  if (!/factoring-detail-load-link/.test(detail) || !/kind="load"/.test(detail)) {
    problems.push("FactoringDetailPage missing load EntityLink");
  }
  if (!/factoring-detail-bank-wire-link/.test(detail) || !/kind="bank_transaction"/.test(detail)) {
    problems.push("FactoringDetailPage missing bank wire EntityLink");
  }

  const be = read("apps/backend/src/accounting/factoring-advances.routes.ts");
  if (!/matched_bank_transaction_id/.test(be)) problems.push("BE fetchAdvanceDetail missing matched_bank_transaction_id");

  const bankView = read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
  if (!/matched_factoring_advance_id/.test(bankView) || !/kind="factoring_advance"/.test(bankView)) {
    problems.push("Bank register missing reverse EntityLink to factoring_advance");
  }

  if (problems.length) fail(problems);
  console.log(`${LABEL} PASS — advances tab · aging-by-factor · drawer both-way · statements chrome · EntityLink · routes`);
}

if (process.argv.includes("--selftest")) {
  check();
  process.exit(0);
}
check();
