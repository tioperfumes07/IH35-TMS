#!/usr/bin/env node
/**
 * verify-referenceselect-coverage-ratchet.mjs  (FIX-06 — inline "+ Create" coverage ratchet)
 *
 * QuickBooks/NetSuite parity (§7 vocab lock + LINKAGE law): every reference dropdown that selects an
 * accounting MASTER ENTITY (vendor / customer / category-or-COA account / item / product-service) on a
 * create/edit form must use the shared `ReferenceSelect` — which puts the inline "+ Add new ___" row as
 * the permanent first option, opens a mini-create, saves via the EXISTING create endpoint, and returns
 * the record already selected, writing to the canonical table (vendor→mdata.vendors, customer→
 * mdata.customers, category→catalogs.accounts, item/service→catalogs.items). A plain <select> /
 * <SelectCombobox> bound to such an entity has NO inline "+ Create" and is a QBO-parity regression.
 *
 * This is a forward-only RATCHET (like the mobile-responsive baseline): it fingerprints every plain-select
 * that binds an accounting-entity value under apps/frontend/src/{pages,components}/accounting and compares
 * against a committed baseline. Pre-existing entity-selects that are legitimately EXEMPT (a bank-account
 * scope/navigation selector — bank-account creation is owner-gated, not a QuickCreate kind; a category-KIND
 * enum; a transactional-record picker) are baselined so today is GREEN. A NEW plain entity-select that is
 * not in the baseline FAILS CI — the author must convert it to ReferenceSelect, or (if genuinely exempt)
 * add it to the baseline with a reason.
 *
 * Sibling guards (distinct, not split-brain):
 *   - verify-reference-dropdown-inline-create.mjs — POSITIVE must-keep set + §7 add-new vocab lock.
 *   - verify-referenceselect-qbo-standard.mjs — the ReferenceSelect/Combobox MECHANISM (no external add
 *     button, add-row not query-gated, inline-create never writes a *_qbo_* mirror).
 *   - THIS guard — the NEGATIVE coverage ratchet: no NEW plain accounting-entity select creeps in.
 *
 * Usage:
 *   node scripts/verify-referenceselect-coverage-ratchet.mjs                  # scan (CI)
 *   node scripts/verify-referenceselect-coverage-ratchet.mjs --list           # print current fingerprints
 *   node scripts/verify-referenceselect-coverage-ratchet.mjs --write-baseline # regenerate the baseline
 *   node scripts/verify-referenceselect-coverage-ratchet.mjs --selftest       # pure-logic self-test
 *
 * LINKAGE: N/A (UI-parity enforcement infra; no entity record, no operating_company_id). Additive only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  "apps/frontend/src/pages/accounting",
  "apps/frontend/src/components/accounting",
];
const BASELINE_REL = "scripts/verify-referenceselect-coverage-ratchet.baseline.json";

// A plain-select whose bound value identifier names an accounting MASTER ENTITY must instead be a
// ReferenceSelect. Tokens deliberately narrow to entity nouns (never filter words like status/method/
// bucket/period/type/basis/source/frequency), so a NEW filter select does not false-fire.
const ENTITY_TOKEN = /vendor|customer|payee|factor|account|categor|item|product|service/i;
const PLAIN_SELECT = /<(?:select|SelectCombobox)\b/g;
// From the tag start, find the first `value={<identifier>...}` binding of the opening tag.
const VALUE_BIND = /value=\{\s*([A-Za-z_$][A-Za-z0-9_$.?]*)/;

export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Given the source of ONE file, return the entity-select value-identifiers it binds (deduped, sorted). */
export function entitySelectsInSource(src) {
  const clean = stripComments(src);
  const found = new Set();
  let m;
  PLAIN_SELECT.lastIndex = 0;
  while ((m = PLAIN_SELECT.exec(clean)) !== null) {
    // Window forward from the tag; the opening tag's value binding sits within a few hundred chars.
    const window = clean.slice(m.index, m.index + 600);
    const vm = window.match(VALUE_BIND);
    if (!vm) continue;
    const ident = vm[1];
    if (ENTITY_TOKEN.test(ident)) found.add(ident);
  }
  return [...found].sort();
}

function walk(dir, out) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const relChild = path.join(dir, e.name);
    if (e.isDirectory()) walk(relChild, out);
    else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) out.push(relChild);
  }
}

/** Fingerprint every current plain accounting-entity select: `<relpath>::<valueIdentifier>`. */
export function computeFingerprints() {
  const files = [];
  for (const d of SCAN_DIRS) walk(d, files);
  files.sort();
  const fps = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const ident of entitySelectsInSource(src)) fps.push(`${rel}::${ident}`);
  }
  return fps.sort();
}

function readBaseline() {
  try {
    const obj = JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE_REL), "utf8"));
    return Array.isArray(obj.fingerprints) ? obj.fingerprints : [];
  } catch {
    return [];
  }
}

export function run() {
  const current = computeFingerprints();
  const baseline = new Set(readBaseline());
  const novel = current.filter((fp) => !baseline.has(fp));
  if (novel.length) {
    const lines = [
      "[verify-referenceselect-coverage-ratchet] FAIL — NEW plain <select>/<SelectCombobox> selecting an",
      "accounting entity (vendor/customer/category-account/item/product-service) on an accounting form.",
      'Convert it to <ReferenceSelect createKind=…> (inline "+ Add new" → canonical create endpoint),',
      "or if it is genuinely exempt (bank-account scope selector / enum-kind / transactional picker) add",
      `it to ${BASELINE_REL} with a reason.`,
      "New offenders:",
      ...novel.map((fp) => `  - ${fp}`),
    ];
    console.error(lines.join("\n"));
    return { ok: false, novel };
  }
  console.log(
    `[verify-referenceselect-coverage-ratchet] PASS — ${current.length} baselined entity-selects, 0 new; ` +
      "all NEW accounting-entity dropdowns must use ReferenceSelect."
  );
  return { ok: true, novel: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const checks = [];
  // A vendor <select> is detected as an entity-select.
  checks.push([
    "vendor select detected",
    entitySelectsInSource(`<select value={vendorId} onChange={(e)=>setVendorId(e.target.value)}><option/></select>`).includes("vendorId"),
  ]);
  // A category-kind SelectCombobox is detected (categor token).
  checks.push([
    "category select detected",
    entitySelectsInSource(`<SelectCombobox value={form.category_kind} onChange={x} />`).includes("form.category_kind"),
  ]);
  // A status FILTER select must NOT be flagged (no entity token) — prevents false-fire on filters.
  checks.push([
    "status filter ignored",
    entitySelectsInSource(`<select value={status} onChange={(e)=>setStatus(e.target.value)} />`).length === 0,
  ]);
  // A ReferenceSelect is not a plain <select> — not flagged.
  checks.push([
    "ReferenceSelect not flagged",
    entitySelectsInSource(`<ReferenceSelect value={vendorId} createKind="vendor" />`).length === 0,
  ]);
  // Comments do not create phantom hits.
  checks.push([
    "commented select ignored",
    entitySelectsInSource(`{/* <select value={vendorId} /> */}`).length === 0,
  ]);
  // Ratchet math: a novel fingerprint not in baseline is caught.
  const current = ["A.tsx::vendorId", "B.tsx::accountId"];
  const baseline = new Set(["B.tsx::accountId"]);
  checks.push(["novel fingerprint caught", current.filter((f) => !baseline.has(f)).join() === "A.tsx::vendorId"]);

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("[verify-referenceselect-coverage-ratchet] SELFTEST FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`[verify-referenceselect-coverage-ratchet] SELFTEST PASS (${checks.length} checks)`);
}

const isMain = path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else if (process.argv.includes("--list")) {
    for (const fp of computeFingerprints()) console.log(fp);
  } else if (process.argv.includes("--write-baseline")) {
    const fps = computeFingerprints();
    const body = {
      _comment:
        "FIX-06 forward-only ratchet baseline. Each fingerprint <relpath>::<valueIdentifier> is a " +
        "pre-existing plain accounting-entity <select>/<SelectCombobox> that is LEGITIMATELY EXEMPT: a " +
        "bank-account scope/navigation/filter selector (bank-account creation is owner-gated, not a " +
        "QuickCreate kind); a category-KIND enum; a transactional-record picker; OR a picker that already " +
        "has inline-create via the older external-'+ Add new'-button + InlineCreateDrawer pattern " +
        "(ManualJEModal account line — keystone migration is a separate follow-up, not a coverage gap). " +
        "A NEW entity-select with no inline-create must be a ReferenceSelect, not added here. " +
        "Regenerate: node scripts/verify-referenceselect-coverage-ratchet.mjs --write-baseline",
      fingerprints: fps,
    };
    fs.writeFileSync(path.join(ROOT, BASELINE_REL), JSON.stringify(body, null, 2) + "\n");
    console.log(`wrote ${fps.length} fingerprints to ${BASELINE_REL}`);
  } else {
    process.exit(run().ok ? 0 : 1);
  }
}
