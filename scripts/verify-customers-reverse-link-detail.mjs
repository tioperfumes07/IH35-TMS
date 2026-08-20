#!/usr/bin/env node
/**
 * Customers reverse_link — Built for detail leaves with EntityLink on CustomerDetail.
 * Create/sync/edit/chrome honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^detail\\.(profile|contacts|billing|quality|lanes|pnl)$","task":"VERTICAL-REVERSE-LINK-customers-detail","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-customers-reverse-link-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-reverse-link-detail";
const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const LOADS_ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const INVOICES_PAGE = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";
const INVOICES_ROUTE = "apps/backend/src/accounting/invoices.routes.ts";
const ROUTE_MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const CHECKS = [
  { name: "load EntityLink", file: DETAIL, pattern: /kind="load"/ },
  { name: "driver EntityLink", file: DETAIL, pattern: /kind="driver"/ },
  { name: "unit EntityLink", file: DETAIL, pattern: /kind="unit"/ },
  {
    name: "customer loads trailer EntityLinkOrTombstone",
    file: DETAIL,
    pattern: /key: "trailer_number"[\s\S]{0,300}<EntityLinkOrTombstone kind="trailer" id=\{load\.trailer_id\} name=\{load\.trailer_number\} noun="Trailer"/,
  },
  {
    name: "loads producer returns canonical trailer id and label",
    file: LOADS_ROUTE,
    pattern: /tr\.id AS trailer_id,\s*tr\.equipment_number AS trailer_number/,
  },
  {
    name: "loads producer scopes trailer assignment to load entity",
    file: LOADS_ROUTE,
    pattern: /WHERE lah\.load_id = l\.id\s*AND lah\.operating_company_id = l\.operating_company_id\s*AND lah\.new_trailer_id IS NOT NULL/,
  },
  { name: "invoice EntityLink", file: DETAIL, pattern: /kind="invoice"/ },
  { name: "vendor EntityLink (factoring)", file: DETAIL, pattern: /kind="vendor"/ },
  { name: "parent customer EntityLinkOrTombstone", file: DETAIL, pattern: /data-testid="customer-parent-record-link"/ },
  { name: "sub-customer EntityLinkOrTombstone", file: DETAIL, pattern: /customer-sub-record-link-/ },
  {
    name: "payment application invoice EntityLinkOrTombstone",
    file: DETAIL,
    pattern: /applications\.map\(\(application\)[\s\S]{0,500}kind="invoice"[\s\S]{0,180}id=\{application\.invoice_id\}[\s\S]{0,180}name=\{application\.invoice_display_id\}/,
  },
  {
    name: "payment application amount remains visible beside invoice drill",
    file: DETAIL,
    pattern: /formatCurrencyCents\(application\.amount_cents\)/,
  },
  {
    name: "customer recent invoices View all preserves canonical customer id",
    file: DETAIL,
    pattern: /navigate\(`\/accounting\/invoices\?customer_id=\$\{encodeURIComponent\(id\)\}`\)/,
  },
  {
    name: "invoice list destination reads customer_id deep link",
    file: INVOICES_PAGE,
    pattern: /const customerId = searchParams\.get\("customer_id"\) \?\? "";/,
  },
  {
    name: "invoice list destination sends customer_id to producer",
    file: INVOICES_PAGE,
    pattern: /customer_id: customerId \|\| undefined/,
  },
  {
    name: "invoice producer applies canonical customer filter",
    file: INVOICES_ROUTE,
    pattern: /if \(q\.customer_id\) \{[\s\S]{0,180}extraWhere\.push\(`i\.customer_id = \$\$\{values\.length\}`\)/,
  },
  {
    name: "customer detail source is mounted",
    file: ROUTE_MANIFEST,
    pattern: /path="\/customers\/:id"[\s\S]{0,180}<CustomerDetailPage \/>/,
  },
  {
    name: "invoice list destination is mounted",
    file: ROUTE_MANIFEST,
    pattern: /path="\/accounting\/invoices"[\s\S]{0,180}<InvoicesListPage \/>/,
  },
];

function readSources() {
  return Object.fromEntries(
    [DETAIL, LOADS_ROUTE, INVOICES_PAGE, INVOICES_ROUTE, ROUTE_MANIFEST].map((file) => [
      file,
      fs.readFileSync(path.join(ROOT, file), "utf8"),
    ]),
  );
}

function run(sources) {
  return CHECKS.filter((c) => !c.pattern.test(sources[c.file])).map((c) => c.name);
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  if (run(live).length) {
    console.error(`${LABEL} SELFTEST FAIL live`);
    process.exit(1);
  }
  for (const check of CHECKS) {
    const globalPattern = new RegExp(check.pattern.source, check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`);
    const plantedSource = live[check.file].replace(globalPattern, "/* planted reverse-link defect */");
    const planted = { ...live, [check.file]: plantedSource };
    if (plantedSource === live[check.file] || !run(planted).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${CHECKS.length}/${CHECKS.length} planted defects rejected`);
  process.exit(0);
}

const fails = run(readSources());
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers detail reverse_link ratcheted`);
