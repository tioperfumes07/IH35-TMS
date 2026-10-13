#!/usr/bin/env node
/**
 * 443.99 — the Required leaf accounting.modal.open_dispute (added by #26363) had no owning guard, so
 * verify-codex-vertical-nonmoney-zero-remainder reported its connectivity column unowned.
 *
 * Connectivity, link by link (nav -> API -> Neon):
 *   1. DisputesHubPage "Open dispute" button opens <OpenDisputeModal>;
 *   2. the modal's submit calls openInvoiceDispute(selectedInvoice.id, …);
 *   3. openInvoiceDispute POSTs /api/v1/accounting/invoices/${invoiceId}/disputes;
 *   4. registerInvoiceDisputeRoutes serves that POST, and the file's default fp export calls it;
 *   5. accounting/index.ts autoloads *.routes files and does not ignore invoice-disputes.
 * A break at any link fails. --selftest plants a break at each link and proves it is caught.
 *
 * Usage: node scripts/verify-open-dispute-modal-connectivity.mjs [--selftest]
 */
/** @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leaves":["accounting.modal.open_dispute"],"task":"443.99-OPEN-DISPUTE-MODAL-CONNECTIVITY"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-open-dispute-modal-connectivity";
const FILES = {
  page: "apps/frontend/src/pages/accounting/DisputesHubPage.tsx",
  api: "apps/frontend/src/api/invoice-disputes.ts",
  routes: "apps/backend/src/accounting/invoice-disputes.routes.ts",
  autoload: "apps/backend/src/accounting/index.ts",
};

export function findProblems(src) {
  const problems = [];
  if (!/onClick=\{\(\) => setOpeningDispute\(true\)\}[\s\S]{0,80}data-testid="open-dispute-btn"/.test(src.page) ||
      !/\{openingDispute \? \(\s*<OpenDisputeModal companyId=\{companyId\}/.test(src.page)) {
    problems.push(`${FILES.page}: the Open dispute button must open <OpenDisputeModal>`);
  }
  const modal = src.page.slice(src.page.indexOf("function OpenDisputeModal("));
  if (!/\bopenInvoiceDispute,/.test(src.page) || !/return openInvoiceDispute\(selectedInvoice\.id, \{/.test(modal)) {
    problems.push(`${FILES.page}: OpenDisputeModal submit must call openInvoiceDispute(selectedInvoice.id, …)`);
  }
  const apiFn = src.api.slice(src.api.indexOf("export function openInvoiceDispute("));
  if (!/^export function openInvoiceDispute\([\s\S]*?`\/api\/v1\/accounting\/invoices\/\$\{invoiceId\}\/disputes`, \{\s*method: "POST"/.test(apiFn)) {
    problems.push(`${FILES.api}: openInvoiceDispute must POST /api/v1/accounting/invoices/\${invoiceId}/disputes`);
  }
  const register = src.routes.slice(src.routes.indexOf("export async function registerInvoiceDisputeRoutes("));
  if (!/app\.post\("\/api\/v1\/accounting\/invoices\/:id\/disputes"/.test(register)) {
    problems.push(`${FILES.routes}: registerInvoiceDisputeRoutes must serve POST /api/v1/accounting/invoices/:id/disputes`);
  }
  if (!/export default fp\(async \(app\) => \{\s*await registerInvoiceDisputeRoutes\(app\);/.test(src.routes)) {
    problems.push(`${FILES.routes}: the default fp export must call registerInvoiceDisputeRoutes (autoload entry)`);
  }
  const ignore = /ignorePattern:\s*(\/.*\/)\s*,/.exec(src.autoload)?.[1] ?? "";
  if (!/matchFilter: \/\\\.routes\\\.\(ts\|js\)\$\//.test(src.autoload) || /invoice-disputes/.test(ignore)) {
    problems.push(`${FILES.autoload}: accounting autoload must load *.routes files and must not ignore invoice-disputes`);
  }
  return problems;
}

function load() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const src = load();
  const planted = [
    ["button no longer opens the modal", { page: src.page.replace("onClick={() => setOpeningDispute(true)}", "onClick={() => undefined}") }],
    ["modal submit no longer calls the API", { page: src.page.replace("return openInvoiceDispute(selectedInvoice.id, {", "return Promise.resolve({") }],
    ["api posts somewhere else", { api: src.api.replace("`/api/v1/accounting/invoices/${invoiceId}/disputes`, {\n    method: \"POST\"", "`/api/v1/accounting/disputes`, {\n    method: \"POST\"") }],
    ["backend route removed", { routes: src.routes.replace('app.post("/api/v1/accounting/invoices/:id/disputes"', 'app.post("/api/v1/accounting/invoices/:id/dispute-x"') }],
    ["default export no longer registers the routes", { routes: src.routes.replace("await registerInvoiceDisputeRoutes(app);\n}, {", "void app;\n}, {") }],
    ["autoload ignores invoice-disputes", { autoload: src.autoload.replace("|(^|\\/)checks\\.routes\\.)/", "|(^|\\/)checks\\.routes\\.|invoice-disputes)/") }],
  ];
  let caught = 0;
  for (const [name, patch] of planted) {
    const mutated = { ...src, ...patch };
    const changed = Object.keys(patch).some((k) => mutated[k] !== src[k]);
    if (changed && findProblems(mutated).length > 0) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted violation escaped${changed ? "" : " (plant did not apply)"} — ${name}`);
  }
  const clean = findProblems(src);
  if (clean.length) console.error(`${LABEL} SELFTEST: real sources flagged — ${clean.join("; ")}`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && clean.length === 0 ? 0 : 1);
}

const problems = findProblems(load());
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Open dispute button → modal → openInvoiceDispute → POST /invoices/:id/disputes → autoloaded route`);
