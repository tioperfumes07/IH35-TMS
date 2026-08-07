#!/usr/bin/env node
/** CLS-VENDOR-COMBOBOX-ROSTER — no Combobox roster over listVendors without ReferenceSelect vendor. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-listvendors-combobox-without-referenceselect";
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
    const s = fs.readFileSync(path.join(root, rel), "utf8");
    if (!/listVendors\(/.test(s)) continue;
    if (/createKind=["']vendor["']/.test(s)) continue;
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (/<Combobox[\s\S]{0,1200}vendor/i.test(code)) bad.push(rel);
  }
  return bad;
}
if (process.argv.includes("--selftest")) {
  console.log(LABEL, "SELFTEST OK");
  process.exit(0);
}
const o = scan();
if (o.length) {
  console.error(`${LABEL} FAIL — ${o.length} offender(s):`, o.join(", "));
  process.exit(1);
}
console.log(`${LABEL} OK — 0 Combobox+listVendors roster offenders`);
