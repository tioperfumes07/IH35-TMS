#!/usr/bin/env node
/**
 * Rows 55 / 56 (register 11-02-2026, board verdict CHROME-ONLY) — Customers › Home and Vendors › Home are built to
 * their V3 boards (docs/design/v3/Customers.dc.html, docs/design/v3/Vendors.dc.html).
 * FAILS IF:
 *   1. /customers or /vendors stops mounting its board (PartyListSwitch → PartyBoard kind="customers" / VendorsHomeBoard);
 *   2. a board section / column / control named on the design is missing from the page source;
 *   3. a page stops calling its one data source (GET /api/v1/mdata/boards/customers | /vendors);
 *   4. any money / count figure printed on the design ships as a literal in the page source (no hardcoded numbers —
 *      the figures are read out of the .dc.html files themselves, so a new board snapshot is covered automatically);
 *   5. a cell that names a record stops linking to it (customer, vendor, factor vendor, category / pays-through account),
 *      or the engine stops returning the ids those links need;
 *   6. a date renders through anything but the shared formatDateUS path (no toLocaleDateString in the boards).
 * Static; no DB. Run: node scripts/verify-customers-vendors-home-boards.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const F = {
  customers: "apps/frontend/src/components/boards/PartyBoard.tsx",
  vendors: "apps/frontend/src/components/boards/VendorsHomeBoard.tsx",
  kit: "apps/frontend/src/components/boards/partyBoardKit.tsx",
  service: "apps/backend/src/mdata/canonical/party-board.service.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  customersDesign: "docs/design/v3/Customers.dc.html",
  vendorsDesign: "docs/design/v3/Vendors.dc.html",
};

const CUSTOMER_LABELS = ["+ Create Customer", "The list opens on the customers you actually do business with", "With transactions", "In the book",
  "Open invoices", "Billed", "A/R open", "Collected", "% past due", "no payments applied", "Open balance", "Factored", "All ", "Possible duplicates",
  "Export", "Print", "Customers · ", "Customer", "Invoices", "Aging", "Last invoice", "Status", "not due", "1–30 late", "31–60 late", "<MeasuredNote"];
const VENDOR_LABELS = ["+ Create Vendor", "The list opens on the vendors you actually pay", "With transactions", "In the book", "Spend YTD", "Fuel share",
  "Open bills", "Unposted fuel", "Spend by category · YTD", "Pays through", "Vendors · ", "Possible duplicates", "Export", "Vendor", "Category",
  "Transactions", "Avg ticket", "Last paid", "<MeasuredNote"];

/** Every figure the design prints (money with cents, counts with a thousands comma, percentages). */
export function designFigures(html) {
  const text = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  return [...new Set([...text.matchAll(/\d{1,3}(?:,\d{3})*\.\d{2}|\d{1,3}(?:,\d{3})+|\d+\.\d%/g)].map((m) => m[0]))];
}

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function audit(src) {
  const f = [];
  const c = code(src.customers), v = code(src.vendors);
  if (!/<PartyListRoute kind="customers">/.test(src.manifest) || !/<PartyListRoute kind="vendors">/.test(src.manifest)) f.push("manifest: /customers and /vendors must mount PartyListRoute");
  if (!/<PartyBoard kind="customers"/.test(c)) f.push("PartyListSwitch must mount the Customers board (PartyBoard kind=\"customers\")");
  if (!/<VendorsHomeBoard /.test(c)) f.push("PartyListSwitch must mount VendorsHomeBoard for vendors");
  for (const l of CUSTOMER_LABELS) if (!c.includes(l)) f.push(`Customers home: board section/label missing: "${l}"`);
  for (const l of VENDOR_LABELS) if (!v.includes(l)) f.push(`Vendors home: board section/label missing: "${l}"`);
  if (!/apiRequest<CustomerBoard>\(`\/api\/v1\/mdata\/boards\/\$\{props\.kind\}\?/.test(c)) f.push("Customers home must call GET /api/v1/mdata/boards/customers");
  if (!/apiRequest<VendorBoard>\(`\/api\/v1\/mdata\/boards\/vendors\?/.test(v)) f.push("Vendors home must call GET /api/v1/mdata/boards/vendors");
  for (const [name, html, s] of [["Customers", src.customersDesign, c], ["Vendors", src.vendorsDesign, v]]) {
    for (const fig of designFigures(html)) if (s.includes(fig)) f.push(`${name} home: design figure "${fig}" is hardcoded — bind it to the engine`);
  }
  if (!/renderFirst=\{\(r\) => <EntityLink kind="customer" id=\{r\.id\}/.test(c)) f.push("Customers home: the customer name must link to the customer");
  if (!/<EntityLink kind="vendor" id=\{r\.factor_vendor_id\}/.test(c)) f.push("Customers home: the Factored cell must link to the factor vendor");
  if (!/renderFirst=\{\(r\) => <EntityLink kind="vendor" id=\{r\.id\}/.test(v)) f.push("Vendors home: the vendor name must link to the vendor");
  if (!/<EntityLink kind="account" id=\{r\.category_account_id\}/.test(v)) f.push("Vendors home: the Category cell must link to its account");
  if (!/<EntityLink kind="account" id=\{r\.pays_through_account_id\}/.test(v)) f.push("Vendors home: the Pays through cell must link to its account");
  for (const field of ["factor_vendor_id:", "category_account_id:", "pays_through_account_id:"]) if (!src.service.includes(field)) f.push(`party-board.service.ts must return ${field.slice(0, -1)}`);
  if (!/export const day = \(d: string \| null\) => \(d \? formatDateUS\(d\)/.test(src.kit)) f.push("partyBoardKit day() must render through formatDateUS (MM/DD/YYYY)");
  for (const [name, s] of [["Customers", c], ["Vendors", v]]) if (/toLocaleDateString|toLocaleString\(/.test(s)) f.push(`${name} home: hand-rolled date/number formatting`);
  if (!/formatCompanyName\(r\.name\)/.test(c) || !/formatCompanyName\(r\.name\)/.test(v)) f.push("names must render through formatCompanyName");
  return f;
}

const read = (p) => readFileSync(p, "utf8");
const src = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, read(p)]));

if (process.argv.includes("--selftest")) {
  const cases = [
    ["real tree passes", src, false],
    ["customers stops calling its board", { ...src, customers: src.customers.replace("/api/v1/mdata/boards/${props.kind}?", "/api/v1/mdata/customers?") }, true],
    ["vendors stops calling its board", { ...src, vendors: src.vendors.replace("/api/v1/mdata/boards/vendors?", "/api/v1/mdata/vendors?") }, true],
    ["design figure hardcoded on customers", { ...src, customers: src.customers.replace('label="Billed" value={', 'label="Billed" value={"$624,076.72" ?? ') }, true],
    ["design figure hardcoded on vendors", { ...src, vendors: src.vendors.replace('label={"Spend YTD"} value={', 'label={"Spend YTD"} value={"$351,241.23" ?? ') }, true],
    ["aging legend dropped", { ...src, customers: src.customers.replaceAll('"1–30 late"', '"late"') }, true],
    ["Print dropped", { ...src, customers: src.customers.replaceAll('{"Print"}', '{"Pr"}') }, true],
    ["Spend by category panel dropped", { ...src, vendors: src.vendors.replaceAll("Spend by category · YTD", "Spend") }, true],
    ["factor cell stops linking", { ...src, customers: src.customers.replace('<EntityLink kind="vendor" id={r.factor_vendor_id}', '<span data-id={r.factor_vendor_id}') }, true],
    ["pays-through cell stops linking", { ...src, vendors: src.vendors.replace('<EntityLink kind="account" id={r.pays_through_account_id}', '<span data-id={r.pays_through_account_id}') }, true],
    ["engine drops pays_through_account_id", { ...src, service: src.service.replaceAll("pays_through_account_id:", "pt_id:") }, true],
    ["customers no longer mounted", { ...src, customers: src.customers.replace('<PartyBoard kind="customers"', "<div") }, true],
    ["hand-rolled date", { ...src, vendors: src.vendors.replace("<span>{day(r.last_paid)}</span>", "<span>{new Date(r.last_paid ?? '').toLocaleDateString()}</span>") }, true],
  ];
  let ok = 0;
  for (const [name, s, shouldFail] of cases) {
    const fails = audit(s);
    const pass = shouldFail ? fails.length > 0 : fails.length === 0;
    console.log(`${pass ? "PASS" : "FAIL"} ${name}${!pass ? ` — ${fails.join("; ") || "no failure raised"}` : ""}`);
    if (pass) ok++;
  }
  console.log(`verify-customers-vendors-home-boards selftest ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const fails = audit(src);
if (fails.length) { console.error(`verify-customers-vendors-home-boards: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`verify-customers-vendors-home-boards: OK — Customers home ${CUSTOMER_LABELS.length} + Vendors home ${VENDOR_LABELS.length} board sections, both bound to /api/v1/mdata/boards, ${designFigures(src.customersDesign).length + designFigures(src.vendorsDesign).length} design figures absent, every named cell links`);
