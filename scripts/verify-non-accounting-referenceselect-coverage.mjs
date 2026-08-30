#!/usr/bin/env node
/** CLS-REFSELECT-NON-ACCT — ratchet: no new bare customer/vendor select outside accounting cluster. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts/verify-non-accounting-referenceselect-coverage.baseline.json");
const SCAN = [
  "apps/frontend/src/pages/dispatch",
  "apps/frontend/src/pages/factoring",
  "apps/frontend/src/pages/operations",
];
const ENTITY = /customer|vendor/i;

function bareEntitySelects(rel, src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const findings = [];
  const selectRe = /<select\b[\s\S]*?<\/select>/g;
  for (const match of clean.matchAll(selectRe)) {
    // Include only the immediately-adjacent label text/attributes. Searching the entire file made
    // an unrelated Sort/Status select look like a customer picker whenever the page also rendered
    // a customer EntityLink somewhere else.
    const contextStart = Math.max(0, (match.index ?? 0) - 240);
    const context = clean.slice(contextStart, (match.index ?? 0) + match[0].length);
    const nearestLabel = context.slice(Math.max(context.lastIndexOf("<label"), 0));
    if (ENTITY.test(nearestLabel)) findings.push(`${rel}::bare-entity-select`);
  }
  return findings;
}

function fps(root) {
  const out = [];
  for (const dir of SCAN) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) {
          const rel = path.relative(root, p).replace(/\\/g, "/");
          const src = fs.readFileSync(p, "utf8");
          out.push(...bareEntitySelects(rel, src));
        }
      }
    })(full);
  }
  return out.sort();
}
function selftest() {
  const cases = [
    ["bare customer picker", `<label>Customer<select value={customerId}><option>Customer</option></select></label>`, true],
    ["bare vendor picker", `<label>Vendor<select name="vendor_id"><option>Vendor</option></select></label>`, true],
    ["Round Trips sort beside unrelated customer link", `<EntityLink kind="customer" id={load.customer_id} /><label>Sort<select><option>by truck</option></select></label>`, false],
    ["status selector on customer page", `<h1>Customers</h1><label>Status<select><option>Active</option></select></label>`, false],
  ];
  let ok = true;
  for (const [name, src, expected] of cases) {
    const actual = bareEntitySelects("fixture.tsx", src).length > 0;
    if (actual !== expected) {
      console.error(`SELFTEST FAIL ${name}: expected=${expected} actual=${actual}`);
      ok = false;
    } else console.log(`SELFTEST ${name}: ${actual ? "caught" : "ignored"}`);
  }
  if (!ok) process.exit(1);
  console.log("verify-non-accounting-referenceselect-coverage SELFTEST PASS 4/4");
}

if (process.argv.includes("--selftest")) selftest();

const current = fps(ROOT);
let baseline = [];
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")).fingerprints ?? [];
} catch {
  fs.writeFileSync(BASELINE, JSON.stringify({ fingerprints: current }, null, 2) + "\n");
  baseline = current;
}
const novel = current.filter((f) => !baseline.includes(f));
if (novel.length) {
  console.error("verify-non-accounting-referenceselect-coverage FAIL novel:", novel.join(", "));
  process.exit(1);
}
console.log("verify-non-accounting-referenceselect-coverage OK");
