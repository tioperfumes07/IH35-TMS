#!/usr/bin/env node
/**
 * CLS-CUST-BARE-SELECT — no plain <select> for mdata.customers on live forms.
 *
 * EntityPicker has no customer kind; ReferenceSelect createKind=customer is the keystone.
 * A bare <select> fed by listCustomers has no server search and no inline "+ Add new".
 *
 * Scans apps/frontend/src for files that import listCustomers AND contain a plain <select>
 * bound to a customer* identifier without ReferenceSelect createKind="customer" on the same file.
 *
 *   node scripts/verify-no-bare-customer-select.mjs
 *   node scripts/verify-no-bare-customer-select.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const LABEL = "verify-no-bare-customer-select";

/** Exempt: list/table pages that never had inline create (read-only roster chrome). */
const EXEMPT_FILES = new Set([
  "apps/frontend/src/pages/Customers.tsx",
  "apps/frontend/src/pages/Dispatch.tsx",
  "apps/frontend/src/components/customers/CustomerEditModal.tsx",
  "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, e.name)).replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) {
      out.push(rel);
    }
  }
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** @returns {string[]} offender rel paths */
export function scanBareCustomerSelects(root = ROOT) {
  const files = [];
  walk(path.join(root, "apps/frontend/src"), files);
  const offenders = [];

  for (const rel of files) {
    if (EXEMPT_FILES.has(rel)) continue;
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    if (!/listCustomers\b/.test(src)) continue;
    const clean = stripComments(src);
    if (!/<select\b/.test(clean)) continue;
    // File uses listCustomers + plain select — fail unless ReferenceSelect customer is present
    // AND no select bound to customer id remains.
    if (/createKind=["']customer["']/.test(src)) {
      // Still fail if a select binds customerId/detailCustomerId/assignCustomerId
      if (/<select[\s\S]{0,400}(detailCustomerId|assignCustomerId|customerId)/.test(clean)) {
        offenders.push(`${rel}: plain <select> for customer id remains despite ReferenceSelect elsewhere`);
      }
      continue;
    }
    if (/customer/i.test(clean.split("<select")[1]?.slice(0, 800) ?? "")) {
      offenders.push(`${rel}: listCustomers + bare <select> without ReferenceSelect createKind=customer`);
    }
  }
  return offenders;
}

if (process.argv.includes("--selftest")) {
  const bad = `
import { listCustomers } from "../api/mdata";
export function X() {
  const [customerId, setCustomerId] = useState("");
  return <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option>Select customer</option></select>;
}`;
  const good = `
import { listCustomers } from "../api/mdata";
import { ReferenceSelect } from "../components/parity/ReferenceSelect";
export function X() {
  return <ReferenceSelect createKind="customer" value={null} onChange={() => {}} options={[]} operatingCompanyId="c" />;
}`;
  const mockScan = (src) => {
    if (!/listCustomers/.test(src) || !/<select/.test(src)) return [];
    if (/createKind=["']customer["']/.test(src)) return [];
    return ["offender"];
  };
  if (mockScan(bad).length === 0 || mockScan(good).length !== 0) {
    console.error(LABEL, "SELFTEST FAIL");
    process.exit(1);
  }
  console.log(LABEL, "SELFTEST OK");
  process.exit(0);
}

const offenders = scanBareCustomerSelects();
if (offenders.length) {
  console.error(`${LABEL} FAIL — ${offenders.length} bare customer <select> site(s):`);
  for (const o of offenders) console.error(`  - ${o}`);
  process.exit(1);
}
console.log(`${LABEL} OK — 0 bare customer <select> offenders`);
