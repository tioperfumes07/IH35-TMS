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
  // C1 (owner correction 2026-09-02): the raw `c.display_name.trim() || c.id` ternary fell back to
  // a bare machine uuid on an operator-facing label whenever the name came back empty/blank.
  // entityLabel() rejects an empty AND a uuid-shaped name and falls back to "Customer — not
  // visible" instead — the same convention every other reverse-link label in this codebase already
  // uses (BillsReverseSection, EntityLinkOrTombstone). Accept either shape so this guard doesn't
  // block a strictly SAFER label contract than the one it was originally written against.
  if (
    (!/label:\s*c\.display_name\.trim\(\)\s*\|\|\s*c\.id/.test(code) &&
      !/label:\s*entityLabel\(c\.display_name,\s*c\.id,\s*["']Customer["']\)/.test(code)) ||
    /c\.(?:name|customer_code|legal_name)/.test(code)
  ) {
    problems.push(`${FILE}: picker label must use the typed canonical Customer display_name contract`);
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
  // Same C1 acceptance as above — entityLabel() is the safer, currently-shipped shape.
  if (
    (!/label:\s*c\.display_name\.trim\(\)\s*\|\|\s*c\.id/.test(liveCode) &&
      !/label:\s*entityLabel\(c\.display_name,\s*c\.id,\s*["']Customer["']\)/.test(liveCode)) ||
    /c\.(?:name|customer_code|legal_name)/.test(liveCode)
  ) {
    problems.push(`${LIVE_WIZARD}: picker label must use the typed canonical Customer display_name contract`);
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
  // C1: the seeded (watchedCustomerId, missing-from-API-page) option's label is entityLabel(name,
  // id, "Customer") now too, same acceptance as the two checks above.
  if (
    !/watchedCustomerId[\s\S]{0,1200}?label:\s*name \|\| id/.test(liveCode) &&
    !/watchedCustomerId[\s\S]{0,1200}?label:\s*entityLabel\(name,\s*id,\s*["']Customer["']\)/.test(liveCode)
  ) {
    problems.push(`${LIVE_WIZARD}: seeded customer option must use customer_name (or id) as label`);
  }
  const customerKey = liveCode.match(/queryKey:\s*\[[^\]]*book-load-v4-customers-autocomplete[^\]]*\]/);
  if (customerKey && /trip_type/.test(customerKey[0])) {
    problems.push(`${LIVE_WIZARD}: customer autocomplete must never include trip_type in the query`);
  }
  const auto = readRel(root, "apps/backend/src/mdata/customer-autocomplete.shared.ts") ?? "";
  if (!auto.includes("`%${term}%`")) {
    problems.push("customer-autocomplete.shared.ts: search must be substring (%term%), not prefix");
  }
  if (!/translate\(\s*lower\(c\.customer_name\)/.test(auto)) {
    problems.push("customer-autocomplete.shared.ts: name search must be accent-insensitive");
  }
  if (!/deactivated_at IS NULL/.test(auto) || /c\.status\s*=/.test(auto)) {
    problems.push("customer-autocomplete.shared.ts: active predicate must be deactivated_at IS NULL (not status)");
  }
  const dual = /status\s*!==\s*["']inactive["']\s*&&\s*!c\.deactivated_at/;
  for (const rel of [
    "apps/frontend/src/pages/Customers.tsx",
    "apps/frontend/src/pages/CustomerDetail.tsx",
    "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
    "apps/frontend/src/components/customers/CustomerEditModal.tsx",
  ]) {
    const fe = readRel(root, rel) ?? "";
    if (dual.test(fe)) {
      problems.push(`${rel}: selectable parent filter must use deactivated_at only (VOID-COLUMN 2026-09-03)`);
    }
  }
  const selectable = readRel(root, "apps/frontend/src/lib/customer-selectable.ts") ?? "";
  if (!/deactivated_at == null/.test(selectable)) {
    problems.push("customer-selectable.ts: customerIsSelectable must be deactivated_at == null");
  }
  if (/\btrip_type\b/.test(auto)) {
    problems.push("customer-autocomplete.shared.ts: must not filter by trip_type");
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

    for (const rel of [FILE, LIVE_WIZARD]) {
      const target = path.join(stubRoot, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const source = readRel(ROOT, rel);
      if (!source) throw new Error(`missing selftest source ${rel}`);
      // Mutate whichever shape the real source actually carries today (the raw ternary or the
      // entityLabel() call this guard now also accepts) back to a bare uuid label — the real defect.
      const mutated = source.includes('label: entityLabel(c.display_name, c.id, "Customer")')
        ? source.replace('label: entityLabel(c.display_name, c.id, "Customer")', "label: c.id")
        : source.replace("label: c.display_name.trim() || c.id", "label: c.id");
      fs.writeFileSync(target, mutated);
    }
    const labelMutation = collectProblems(stubRoot);
    if (!labelMutation.some((problem) => problem.includes("typed canonical Customer display_name contract"))) {
      console.error(`${LABEL} SELFTEST FAIL: real-source display_name mutation did not FAIL`);
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
