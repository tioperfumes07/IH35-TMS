#!/usr/bin/env node
/**
 * BookLoadCustomerSection — customer ReferenceSelect server search (not silent limit:5000).
 * Cursor even claim: 2118.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bookload-customer-server-search";
const FILE = "apps/frontend/src/pages/dispatch/components/BookLoadCustomerSection.tsx";
const LIVE_WIZARD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) {
    problems.push(`missing ${FILE}`);
    return problems;
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/customerSearch/.test(code) || !/onSearch=\{setCustomerSearch\}/.test(code)) {
    problems.push(`${FILE}: customer ReferenceSelect must wire customerSearch + onSearch`);
  }
  if (!/createKind=["']customer["']/.test(code)) {
    problems.push(`${FILE}: must keep createKind=customer`);
  }
  if (!/disabled=\{customersQuery\.isLoading \|\| customersQuery\.isError\}/.test(code)) {
    problems.push(`${FILE}: failed customer reads must disable the dependent picker`);
  }
  if (!/customersQuery\.isError[\s\S]{0,180}?ListErrorBanner[\s\S]{0,180}?customersQuery\.refetch\(\)/.test(code)) {
    problems.push(`${FILE}: failed customer reads must disclose exact Retry instead of an empty picker`);
  }
  if (/limit:\s*5000/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:5000 customer page`);
  }
  if (!/label:\s*String\(c\.name\s*\|\|\s*c\.customer_code/.test(code) || /c\.legal_name/.test(code)) {
    problems.push(`${FILE}: picker label must use the typed canonical Customer name/code contract`);
  }
  const live = readRel(root, LIVE_WIZARD);
  if (!live) {
    problems.push(`missing ${LIVE_WIZARD}`);
    return problems;
  }
  const liveCode = live.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/customerSearch/.test(liveCode) || !/onSearch=\{setCustomerSearch\}/.test(liveCode)) {
    problems.push(`${LIVE_WIZARD}: live Book Load wizard must wire customerSearch + onSearch (not a silent 5000-row dump)`);
  }
  if (/limit:\s*5000/.test(liveCode) && /book-load-v4-customers/.test(liveCode)) {
    problems.push(`${LIVE_WIZARD}: must not fetch silent limit:5000 for the customer picker`);
  }
  if (!/label:\s*String\(c\.name\s*\|\|\s*c\.customer_code/.test(liveCode) || /c\.legal_name/.test(liveCode)) {
    problems.push(`${LIVE_WIZARD}: picker label must use the typed canonical Customer name/code contract`);
  }
  if (!/disabled=\{customersQuery\.isLoading \|\| customersQuery\.isError\}/.test(liveCode)) {
    problems.push(`${LIVE_WIZARD}: failed customer reads must disable the dependent picker`);
  }
  if (!/customersQuery\.isError[\s\S]{0,180}?ListErrorBanner[\s\S]{0,180}?customersQuery\.refetch\(\)/.test(liveCode)) {
    problems.push(`${LIVE_WIZARD}: failed customer reads must disclose exact Retry instead of an empty picker`);
  }
  // ACCT-F10158 — Edit Load hydrates customer_id via form.reset, but the capped listCustomers page
  // often omits that row. Without seeding the committed customer into options, Combobox shows the
  // empty placeholder and Save can fail closed / look dead. (Marker is code, not a // comment —
  // this guard strips line comments before matching.)
  if (!/watchedCustomerId[\s\S]{0,900}?fromApi\.some[\s\S]{0,200}?o\.value === id/.test(liveCode)) {
    problems.push(`${LIVE_WIZARD}: customerOptions must seed watchedCustomerId when missing from API page`);
  }
  if (!/watchedCustomerId[\s\S]{0,1200}?label:\s*name \|\| id/.test(liveCode)) {
    problems.push(`${LIVE_WIZARD}: seeded customer option must use customer_name (or id) as label`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-bookload-customer-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/dispatch/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "BookLoadCustomerSection.tsx"),
      `listCustomers({ operating_company_id: id, limit: 5000 })
<ReferenceSelect createKind="customer" options={customerOptions} />
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — BookLoad customer server search`);
}
