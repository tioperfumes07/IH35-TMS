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
          const src = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
          if (/<select\b/.test(src) && ENTITY.test(src) && !/createKind=["'](customer|vendor)["']/.test(src)) {
            out.push(`${rel}::bare-entity-select`);
          }
        }
      }
    })(full);
  }
  return out.sort();
}
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
