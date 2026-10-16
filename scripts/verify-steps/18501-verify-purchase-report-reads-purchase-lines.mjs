#!/usr/bin/env node
/**
 * 443.172 — owner 2026-10-16 15:20 CT, Factoring → Purchase report: "in the gear there is no settlement and load columns,
 * but the columns appear in the screen ... in debtor for 10-5-26 onward it shows an unknown customer."
 * Measured: the report read accounting.factoring_advances (incl. 8 VOIDED advances FAC-2026-00001..00008 with 0 invoices →
 * "Unknown Customer", 10/05), one row per wire (first invoice only, whole wire gross), escrow shown under "Cash Rsv";
 * Load Number and Settlement/Tour were alwaysVisible, so the gear could not list them.
 *
 * Guards:
 *   1. listPurchaseLines reads factoring_purchase_lines on posted, non-voided purchases (voided never appear).
 *   2. GET /api/v1/factoring/purchase-lines is registered.
 *   3. The Purchase Report table renders purchaseReportLines from listFactoringPurchaseLines.
 *   4. No Purchase Report column is alwaysVisible (every column is in the gear).
 * --selftest: re-adds alwaysVisible on Load Number and drops the voided filter; asserts both are caught.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SVC = "apps/backend/src/factoring/purchase.service.ts";
const ROUTES = "apps/backend/src/factoring/purchase.routes.ts";
const PAGE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const KPI = "apps/frontend/src/components/shared/LedgerKpiPanel.tsx";
const NOTE = "apps/frontend/src/components/accounting/UnclearedDocumentsNote.tsx";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

function reportBlock(page) {
  const a = page.indexOf('data-testid="factoring-purchase-report"');
  // The section ends where the next tab section starts (443.173 removed the footnote marker).
  const b = page.indexOf("{show(", a);
  return a >= 0 && b > a ? page.slice(a, b) : "";
}

function check(src = {}) {
  const svc = src.svc ?? read(SVC);
  const routes = src.routes ?? read(ROUTES);
  const page = src.page ?? read(PAGE);
  const findings = [];
  const fn = svc.slice(svc.indexOf("export async function listPurchaseLines"), svc.indexOf("export async function listPurchaseLines") + 2500);
  if (!fn.includes("export async function listPurchaseLines")) findings.push(`${SVC}: listPurchaseLines missing`);
  else {
    if (!/p\.status = 'posted'/.test(fn)) findings.push(`${SVC}: listPurchaseLines must read posted purchases only`);
    if (!/p\.voided_at IS NULL/.test(fn) || !/pl\.voided_at IS NULL/.test(fn)) findings.push(`${SVC}: listPurchaseLines must exclude voided purchases and voided lines`);
    if (!/FROM accounting\.factoring_purchase_lines pl/.test(fn)) findings.push(`${SVC}: listPurchaseLines must read factoring_purchase_lines (one row per invoice)`);
  }
  if (!/app\.get\("\/api\/v1\/factoring\/purchase-lines"/.test(routes)) findings.push(`${ROUTES}: GET /api/v1/factoring/purchase-lines not registered`);
  const block = reportBlock(page);
  if (!block) findings.push(`${PAGE}: Purchase Report block not found`);
  else {
    if (!/rows=\{purchaseReportLines\}/.test(block)) findings.push(`${PAGE}: Purchase Report must render purchaseReportLines (purchase engine), not advances`);
    if (/alwaysVisible/.test(block)) findings.push(`${PAGE}: a Purchase Report column is alwaysVisible — the gear cannot list or hide it`);
  }
  if (!/listFactoringPurchaseLines\(companyId/.test(page)) findings.push(`${PAGE}: Purchase Report does not query listFactoringPurchaseLines`);
  // 443.173 — Summary is one row per purchase (different rows from Detail), never the same table twice.
  if (!/purchaseReportView === "summary" \? \(/.test(block) || !/rows=\{purchaseReportSummary\}/.test(block)) findings.push(`${PAGE}: Purchase Report Summary must render purchaseReportSummary (one row per purchase), not the Detail rows`);
  // 443.173 — nothing packed by default: KPI panel opens collapsed; the not-cleared list opens on demand, never inline.
  const kpi = src.kpi ?? read(KPI);
  if (!/useState<boolean>\(\(\) => readOpen\(domain\)\)/.test(kpi) || !/\$\{open \? "" : "hidden "\}grid/.test(kpi)) findings.push(`${KPI}: KPI panel must open collapsed (title row only) until the viewer opens it`);
  const note = src.note ?? read(NOTE);
  if (!/const \[open, setOpen\] = useState\(false\)/.test(note) || !/\{open \? \(/.test(note)) findings.push(`${NOTE}: the not-cleared list must open on demand (one line by default), never render inline`);
  return findings;
}

if (process.argv.includes("--selftest")) {
  const page = read(PAGE);
  const svc = read(SVC);
  const mutPage = page.replace('key: "load_number",\n                    label: "Load Number",', 'key: "load_number",\n                    label: "Load Number",\n                    alwaysVisible: true,');
  const mutSvc = svc.replace(`"p.voided_at IS NULL", "pl.voided_at IS NULL"`, `"pl.voided_at IS NULL"`);
  if (mutPage === page || mutSvc === svc) { console.error("SELFTEST FAIL: could not inject mutations"); process.exit(1); }
  const a = check({ page: mutPage });
  const b = check({ svc: mutSvc });
  if (!a.some((f) => f.includes("alwaysVisible")) || !b.some((f) => f.includes("voided"))) {
    console.error("SELFTEST FAIL: guard missed a mutation", a, b);
    process.exit(1);
  }
  console.log("SELFTEST PASS: caught alwaysVisible column + voided purchases");
  process.exit(0);
}

const findings = check();
if (findings.length) {
  console.error(`verify-purchase-report-reads-purchase-lines FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-purchase-report-reads-purchase-lines PASS: one row per purchased invoice, voided excluded, every column in the gear");
