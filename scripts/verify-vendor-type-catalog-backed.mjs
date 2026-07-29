#!/usr/bin/env node
/**
 * Vendor types must come from catalogs.vendor_types — never a hardcoded list.
 *
 * THE DEFECT THIS LOCKS OUT (verified live 2026-07-29): catalogs.vendor_types held 8 types per entity
 * across all three companies, entity-scoped with FORCE RLS, and NOTHING in the backend read it. The
 * vendor create form used a frozen TypeScript union — "Fuel" | "Repair" | "Tires" | … — plus a matching
 * literal array. So a vendor type could be SELECTED but never added, renamed or retired: a new catalog
 * row would not appear in the picker, and the union would have rejected it anyway. The two lists agreed
 * only because the table was seeded to match; nothing kept them in sync.
 *
 * This is the shape a well-meaning "just add the option quickly" edit would restore, which is why it is
 * a CI failure rather than a comment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FILES = [
  "apps/frontend/src/api/mdata.ts",
  "apps/frontend/src/components/vendors/VendorCreateModal.tsx",
  "apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx",
  "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
];

/** The literal vendor-type values that used to be frozen in code. */
const KNOWN = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll"];

function stripComments(src) {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
}

/**
 * A union or array literal is "frozen vendor types" when it lists THREE OR MORE of the known values.
 * Three, not one: "Other" or "Fuel" alone appears legitimately elsewhere (a default value, an unrelated
 * enum). Three together in one construct is unmistakably the vendor-type list.
 */
export function frozenVendorTypeLists(src) {
  const clean = stripComments(src);
  const hits = [];
  // Union types and array literals both reduce to a run of quoted strings separated by | or ,
  const runRe = /(?:"[A-Za-z ]+"\s*[|,]\s*){2,}"[A-Za-z ]+"/g;
  for (const m of clean.matchAll(runRe)) {
    const found = KNOWN.filter((k) => m[0].includes(`"${k}"`));
    if (found.length >= 3) hits.push({ snippet: m[0].replace(/\s+/g, " ").slice(0, 160), found });
  }
  return hits;
}

function selftest() {
  const cases = [
    { name: "frozen union is caught", src: `vendor_type: "Fuel" | "Repair" | "Tires" | "Other";`, expect: 1 },
    { name: "frozen array is caught", src: `const V = ["Fuel", "Repair", "Towing", "Toll"];`, expect: 1 },
    { name: "catalog-backed code passes", src: `vendor_type: string; // from catalogs.vendor_types`, expect: 0 },
    { name: "two unrelated strings do not trip it", src: `const x = ["Fuel", "Other"];`, expect: 0 },
    { name: "comment describing the defect does not trip it", src: `// was "Fuel" | "Repair" | "Tires" | "Other"\nconst v: string = "";`, expect: 0 },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = frozenVendorTypeLists(c.src).length;
    if (got !== c.expect) {
      console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got}`);
      bad += 1;
    } else console.log(`  selftest OK — ${c.name}`);
  }
  if (bad) {
    console.error(`verify-vendor-type-catalog-backed SELFTEST FAIL — ${bad}/${cases.length}`);
    process.exit(1);
  }
  console.log(`verify-vendor-type-catalog-backed SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const violations = [];
  let scanned = 0;
  for (const rel of FILES) {
    let src;
    try {
      src = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue; // file may legitimately not exist in a future refactor
    }
    scanned += 1;
    for (const h of frozenVendorTypeLists(src)) violations.push({ rel, ...h });
  }

  if (scanned === 0) {
    console.error("verify-vendor-type-catalog-backed FAIL — scanned 0 files; refusing to report green");
    process.exit(1);
  }

  if (violations.length) {
    console.error("verify-vendor-type-catalog-backed FAIL — a hardcoded vendor-type list is back:\n");
    for (const v of violations) console.error(`  ${v.rel}\n    ${v.snippet}\n    matches: ${v.found.join(", ")}\n`);
    console.error("Vendor types are operator-managed in catalogs.vendor_types, per entity.");
    console.error("Use the catalog-backed picker (createKind=\"vendor_type\") instead.");
    process.exit(1);
  }

  console.log(`verify-vendor-type-catalog-backed OK — ${scanned} file(s) scanned, no hardcoded vendor-type list`);
}

main();
