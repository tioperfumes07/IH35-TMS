#!/usr/bin/env node
/**
 * ROUND 297 — CUSTOMERS / VENDORS tab linkage audit (OUTBOX-CC-3, round 297): every drill lands on the SAME filter the
 * tab counted, and voiding the source changes the tab. FAILS IF a fixed drill / reverse regresses:
 *   customers/Billing: open-invoice count drills to has_balance; Recent Invoices + View all read live (status active)
 *   customers/P&L: full report carries customer_id + period, and the report honours them; the revenue basis is named
 *   customers/COI: the status selector applies on the customer tab
 *   vendors/A/P: bills + expenses live only; "Pay bills" lands on THIS vendor's bill payments (the old /accounting/
 *   pay-bills was never a route), and the bill-payments page reads ?vendor_id=
 * Run: node scripts/verify-party-tab-drills-and-reverse.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const F = {
  cust: "apps/frontend/src/pages/CustomerDetail.tsx",
  vend: "apps/frontend/src/pages/VendorDetail.tsx",
  prof: "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx",
  bp: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  coi: "apps/frontend/src/pages/customers/CoiTab.tsx",
};
const CHECKS = [
  ["cust", /accounting\/invoices\?customer_id=\$\{encodeURIComponent\(id\)\}&has_balance=true/, "Billing open-invoice count must drill to has_balance"],
  ["cust", /listInvoices\(operatingCompanyId!, \{ customer_id: id, status: "active" \}\)/, "Recent Invoices must read live invoices only"],
  ["cust", /accounting\/invoices\?customer_id=\$\{encodeURIComponent\(id\)\}&status=active/, "View all must land on live invoices"],
  ["cust", /customer-profitability\?customer_id=\$\{encodeURIComponent\(id\)\}&period_start=\$\{pnlRange\.start\}&period_end=\$\{pnlRange\.end\}/, "P&L full report must carry customer + period"],
  ["cust", /data-testid="customer-pnl-basis"/, "P&L must name its revenue basis"],
  ["prof", /searchParams\.get\("customer_id"\)/, "profitability report must honour ?customer_id="],
  ["prof", /rows\.filter\(\(r\) => r\.customer_id === deepCustomerId\)/, "profitability report must scope to the drilled customer"],
  ["coi", /status: statusFilter \|\| undefined,/, "COI status selector must apply on the customer tab"],
  ["vend", /listVendorBills\(companyId, \{ vendor_id: id, include_balance: true, status: "active", limit: 200 \}\)/, "vendor A/P bills must be live only"],
  ["vend", /listExpenses\(companyId, \{ vendor_uuid: id, status: "active", limit: 200 \}\)/, "vendor A/P expenses must be live only"],
  ["vend", /to=\{`\/accounting\/bill-payments\?vendor_id=\$\{encodeURIComponent\(id\)\}`\}/, "Pay bills must land on this vendor's bill payments"],
  ["bp", /useState\(\(\) => searchParams\.get\("vendor_id"\) \?\? ""\)/, "bill payments must honour ?vendor_id="],
];

export function audit(src) {
  const f = CHECKS.filter(([k, re]) => !re.test(src[k])).map(([k, , m]) => `${F[k]}: ${m}`);
  if (/to="\/accounting\/pay-bills"/.test(src.vend)) f.push(`${F.vend}: /accounting/pay-bills is not a route`);
  return f;
}

const src = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, readFileSync(p, "utf8")]));
const fails = audit(src);
if (fails.length) { console.error(`verify-party-tab-drills-and-reverse: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const m = [
    ["voided invoices back", { ...src, cust: src.cust.replace('{ customer_id: id, status: "active" }', "{ customer_id: id }") }],
    ["dead pay-bills link", { ...src, vend: src.vend.replace("to={`/accounting/bill-payments?vendor_id=${encodeURIComponent(id)}`}", 'to="/accounting/pay-bills"') }],
    ["report drops customer", { ...src, prof: src.prof.replace("rows.filter((r) => r.customer_id === deepCustomerId)", "rows") }],
  ];
  for (const [n, s] of m) if (audit(s).length === 0) { console.error(`selftest FAIL: ${n}`); process.exit(1); }
  console.log(`verify-party-tab-drills-and-reverse selftest ${m.length}/${m.length} caught`);
}
console.log(`verify-party-tab-drills-and-reverse: OK — ${CHECKS.length} drill / reverse contracts hold`);
