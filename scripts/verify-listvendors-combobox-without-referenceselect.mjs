#!/usr/bin/env node
/** CLS-VENDOR-COMBOBOX-ROSTER — no Combobox roster over listVendors without ReferenceSelect vendor. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-listvendors-combobox-without-referenceselect";

/**
 * Honesty_audit-documented exceptions — a plain free-text suggestion Combobox over listVendors is
 * correct here, not a picker-law violation, because the underlying field genuinely has no vendor_id
 * FK to select. Forcing a real ReferenceSelect/EntityPicker would fabricate a linkage the schema
 * doesn't have. See docs/specs/scoreboard/modules/<module>.required.json honesty_audit notes.
 */
const ALLOWLIST = new Set([
  // maintenance.required.json honesty_audit: parts.create's vendor_default is a denormalized
  // free-text label, never a real vendor_id FK — "Parts are NOT a linkable entity" per the page's
  // own comment. 21 other maintenance leaves keep the real Required marking with a genuine
  // ReferenceSelect(createKind="vendor")/EntityLink; only this one is the documented exception.
  "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx",
]);

function walk(d, out, root) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out, root);
    else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) out.push(path.relative(root, p).replace(/\\/g, "/"));
  }
}
export function scan(root = ROOT) {
  const files = [];
  walk(path.join(root, "apps/frontend/src"), files, root);
  const bad = [];
  for (const rel of files) {
    if (ALLOWLIST.has(rel)) continue;
    const s = fs.readFileSync(path.join(root, rel), "utf8");
    if (!/listVendors\(/.test(s)) continue;
    if (/createKind=["']vendor["']/.test(s)) continue;
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (/<Combobox[\s\S]{0,1200}vendor/i.test(code)) bad.push(rel);
  }
  return bad;
}

function selftest() {
  const live = scan();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree already red: ${live.join(", ")}`);
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".listvendors-combobox-selftest-"));
  try {
    const rel = "apps/frontend/src/pages/maintenance/parts/PlantedOffenderPage.tsx";
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(
      abs,
      `listVendors({ operating_company_id: companyId });\n<Combobox options={vendorOptions} value={vendor} onChange={setVendor} />\n`,
    );
    const planted = scan(tmp);
    if (!planted.includes(rel)) {
      console.error(`${LABEL} SELFTEST FAIL — planted Combobox+listVendors offender not caught`);
      process.exit(1);
    }
    // Allowlisted file must still be ignored even when planted with the same offending shape.
    const allowedRel = "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx";
    const allowedAbs = path.join(tmp, allowedRel);
    fs.mkdirSync(path.dirname(allowedAbs), { recursive: true });
    fs.writeFileSync(
      allowedAbs,
      `listVendors({ operating_company_id: companyId });\n<Combobox options={vendorOptions} value={vendor} onChange={setVendor} />\n`,
    );
    const withAllowed = scan(tmp);
    if (withAllowed.includes(allowedRel)) {
      console.error(`${LABEL} SELFTEST FAIL — documented honesty_audit exemption not respected`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST PASS — catches a real offender, respects the documented exemption`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}
const o = scan();
if (o.length) {
  console.error(`${LABEL} FAIL — ${o.length} offender(s):`, o.join(", "));
  process.exit(1);
}
console.log(`${LABEL} OK — 0 Combobox+listVendors roster offenders`);
