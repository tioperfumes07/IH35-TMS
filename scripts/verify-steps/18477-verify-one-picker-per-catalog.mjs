#!/usr/bin/env node
/**
 * LEAD 443.160 (owner 2026-10-16: "All these perform the same function, so they should have the same functions and
 * catalogs etc. That is how you create duplicates.") — ONE catalog source per catalog, used by every form that picks it.
 *
 * Census on main (static scan of apps/frontend/src, measured row counts in the PR):
 *   accounts — three copies of the same paged /catalogs/accounts query (banking getCoaAccounts, catalog-accounts
 *              listCatalogAccounts, accounting listCoaAccountsForJe), one raw first-page fetch (DriverInbox), and a dead
 *              second chart read off the mdata.qbo_accounts mirror (qbo-mdata "account").
 *   classes  — /catalogs/classes (listClassesForJe: no entity, an ignored include_inactive) beside
 *              /catalogs/accounting/classes (every other class picker).
 *   items    — /catalogs/items (the pay-line item autocomplete) beside /catalogs/accounting/items (every other item picker).
 *
 * Guards:
 *   1. ZERO-ALLOWLIST catalogs — the list query lives in ONE file; any other GET of the catalog, or a second
 *      endpoint for it, fails:
 *        accounts → apps/frontend/src/api/catalog-accounts.ts getCoaAccounts (QBO form-type filters are its named
 *                   ChartOfAccountsQuery parameters, never a second query); no /mdata/qbo/accounts anywhere.
 *        classes  → apps/frontend/src/api/catalogs-accounting.ts classesCatalogClient; no /catalogs/classes list.
 *        items    → apps/frontend/src/api/catalogs-accounting.ts itemsCatalogClient; no /catalogs/items list.
 *   2. SHRINK-ONLY catalogs (vendors, customers, drivers, units, trailers, loads, locations, payment terms, payment
 *      methods, bank accounts) — every file that GETs the catalog's collection is pinned in
 *      18477-catalog-sources.baseline.json; a new file fails, and the baseline may only shrink against origin/main.
 *      Registry declarations (catalogPickerRegistry / entityPickerRegistry) declare endpoints, they do not fetch.
 *
 * --selftest: plants each regression and asserts the guard fails.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FE = "apps/frontend/src";
const BASELINE_REL = "scripts/verify-steps/18477-catalog-sources.baseline.json";
const DECLARATIONS = new Set([`${FE}/components/parity/catalogPickerRegistry.ts`, `${FE}/components/parity/entityPickerRegistry.ts`]);
const END = "(?=[?`\"'$])";

export const ZERO = {
  accounts: { owner: `${FE}/api/catalog-accounts.ts`, list: new RegExp(`/api/v1/catalogs/accounts${END}`), forbidden: [/\/api\/v1\/mdata\/qbo\/accounts/] },
  classes: { owner: `${FE}/api/catalogs-accounting.ts`, list: null, forbidden: [new RegExp(`/api/v1/catalogs/classes${END}`)] },
  items: { owner: `${FE}/api/catalogs-accounting.ts`, list: null, forbidden: [new RegExp(`/api/v1/catalogs/items${END}`)] },
};

export const PINNED = {
  vendors: new RegExp(`/api/v1/(mdata/vendors|vendors|accounting/vendors|maintenance/vendors)${END}`),
  customers: new RegExp(`/api/v1/(mdata/customers|customers|accounting/customers)${END}`),
  drivers: new RegExp(`/api/v1/(mdata/drivers|drivers|dispatch/drivers|maintenance/drivers|driver-finance/drivers)${END}`),
  units: new RegExp(`/api/v1/(mdata/units|units|maintenance/units|fleet/units)${END}`),
  trailers: new RegExp(`/api/v1/(mdata/equipment|mdata/trailers|trailers|fleet/trailers)${END}`),
  loads: new RegExp(`/api/v1/(mdata/loads|dispatch/loads|loads)${END}`),
  locations: new RegExp(`/api/v1/(mdata/locations|lists/locations|catalogs/locations|locations)${END}`),
  payment_terms: new RegExp(`/api/v1/(catalogs/payment-terms|catalogs/accounting/payment-terms|catalogs/accounting/terms)${END}`),
  payment_methods: new RegExp(`/api/v1/(catalogs/payment-methods|catalogs/accounting/payment-methods|accounting/payment-methods)${END}`),
  bank_accounts: new RegExp(`/api/v1/(banking/plaid/accounts|banking/bank-accounts|accounting/bank-accounts)${END}`),
};

function frontendFiles(dir = resolve(ROOT, FE), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "generated") frontendFiles(abs, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(abs);
  }
  return out;
}

/** GET sites only: a reference followed within 5 lines by a write method is a write, not a catalog read. */
function readSites(src, re) {
  const lines = src.split("\n");
  const hits = [];
  lines.forEach((l, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(l) || !re.test(l)) return;
    if (/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(lines.slice(i, i + 6).join(" "))) return;
    hits.push(i + 1);
  });
  return hits;
}

export function census(files) {
  const zero = {};
  const pinned = {};
  for (const [rel, src] of files) {
    if (DECLARATIONS.has(rel)) continue;
    for (const [k, c] of Object.entries(ZERO)) {
      if (c.list && rel !== c.owner && readSites(src, c.list).length) (zero[k] ??= []).push(`${rel}:${readSites(src, c.list)[0]} reads the ${k} catalog outside ${c.owner}`);
      for (const f of c.forbidden) {
        const at = readSites(src, f);
        if (at.length) (zero[k] ??= []).push(`${rel}:${at[0]} reads a second ${k} source (${f.source.replace(/\\/g, "").slice(0, 40)})`);
      }
    }
    for (const [k, re] of Object.entries(PINNED)) if (readSites(src, re).length) (pinned[k] ??= []).push(rel);
  }
  for (const k of Object.keys(pinned)) pinned[k].sort();
  return { zero, pinned };
}

export function check(files, baseline, mainBaseline, ownerSrc) {
  const findings = [];
  const { zero, pinned } = census(files);
  for (const [k, hits] of Object.entries(zero)) for (const h of hits) findings.push(`${k} (allowlist 0): ${h}`);
  if (!/export async function getCoaAccounts</.test(ownerSrc.accounts ?? "")) findings.push("accounts: getCoaAccounts (the one chart-of-accounts source) is missing from api/catalog-accounts.ts");
  if (!/export const classesCatalogClient = createAccountingCatalogClient\("classes"\)/.test(ownerSrc.accounting ?? "")) findings.push("classes: classesCatalogClient (the one class source) is missing");
  if (!/export const itemsCatalogClient = createAccountingCatalogClient\("items"\)/.test(ownerSrc.accounting ?? "")) findings.push("items: itemsCatalogClient (the one item source) is missing");
  for (const [k, list] of Object.entries(pinned)) {
    const allowed = new Set(baseline[k] ?? []);
    for (const rel of list) if (!allowed.has(rel)) findings.push(`${k} (shrink-only): ${rel} is a new source of the ${k} catalog — read the catalog's existing source`);
  }
  if (mainBaseline) {
    for (const [k, list] of Object.entries(baseline)) {
      const was = new Set(mainBaseline[k] ?? []);
      for (const rel of list) if (!was.has(rel)) findings.push(`${BASELINE_REL}: ${k} gained ${rel} — the baseline only shrinks`);
    }
  }
  return findings;
}

function load() {
  const files = frontendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  const baseline = JSON.parse(readFileSync(resolve(ROOT, BASELINE_REL), "utf8")).sources;
  const r = spawnSync("git", ["show", `origin/main:${BASELINE_REL}`], { cwd: ROOT, encoding: "utf8" });
  const mainBaseline = r.status === 0 ? JSON.parse(r.stdout).sources : null;
  const ownerSrc = {
    accounts: readFileSync(resolve(ROOT, `${FE}/api/catalog-accounts.ts`), "utf8"),
    accounting: readFileSync(resolve(ROOT, `${FE}/api/catalogs-accounting.ts`), "utf8"),
  };
  return { files, baseline, mainBaseline, ownerSrc };
}

if (process.argv.includes("--write-baseline")) {
  const files = frontendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  const { pinned } = census(files);
  const fs = await import("node:fs");
  fs.writeFileSync(resolve(ROOT, BASELINE_REL), JSON.stringify({
    _doc: "LEAD 443.160 — files that GET each shrink-only catalog's collection (census 2026-10-16). SHRINK-ONLY: repoint a file to the catalog's one source and remove it here; never add a file.",
    sources: pinned,
  }, null, 2) + "\n");
  console.log("baseline written");
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  const { files, baseline, mainBaseline, ownerSrc } = load();
  const base = check(files, baseline, mainBaseline, ownerSrc);
  if (base.length) {
    console.error("SELFTEST FAIL: baseline not clean", base);
    process.exit(1);
  }
  const add = (rel, src) => [...files, [rel, src]];
  const plants = [
    ["second account query", add(`${FE}/pages/X.tsx`, "apiRequest(`/api/v1/catalogs/accounts?status=active`)"), baseline, ownerSrc],
    ["mirror account source", add(`${FE}/api/x.ts`, 'apiRequest("/api/v1/mdata/qbo/accounts?q=a")'), baseline, ownerSrc],
    ["second class source", add(`${FE}/api/x.ts`, 'apiRequest("/api/v1/catalogs/classes?limit=200")'), baseline, ownerSrc],
    ["second item source", add(`${FE}/api/x.ts`, "apiRequest(`/api/v1/catalogs/items?search=a`)"), baseline, ownerSrc],
    ["new vendor source", add(`${FE}/pages/Y.tsx`, 'apiRequest("/api/v1/mdata/vendors?limit=5")'), baseline, ownerSrc],
    ["one source removed", files, baseline, { ...ownerSrc, accounts: ownerSrc.accounts.replace("export async function getCoaAccounts<", "export async function getCoaAccountsX<") }],
  ];
  for (const [name, f, b, o] of plants) {
    if (check(f, b, mainBaseline, o).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  const grown = { ...baseline, vendors: [...(baseline.vendors ?? []), `${FE}/pages/Z.tsx`] };
  if (check(files, grown, baseline, ownerSrc).length === 0) {
    console.error('SELFTEST FAIL: plant "baseline grows" not caught');
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${plants.length + 1} plants caught`);
  process.exit(0);
}

const { files, baseline, mainBaseline, ownerSrc } = load();
const findings = check(files, baseline, mainBaseline, ownerSrc);
if (findings.length) {
  console.error(`verify-one-picker-per-catalog FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
const { pinned } = census(files);
console.log(`verify-one-picker-per-catalog PASS: accounts / classes / items one source each (allowlist 0); ${Object.values(pinned).reduce((s, l) => s + l.length, 0)} pinned sources across ${Object.keys(pinned).length} shrink-only catalogs`);
