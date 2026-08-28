#!/usr/bin/env node
/**
 * No bulk void/delete of TEST corpus keyed on is_sample_data or TEST/SAMPLE memo.
 * Single named UUID voids remain allowed (void/reversal path must be testable).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-bulk-test-void";

const SKIP = new Set([
  "scripts/verify-no-bulk-test-void.mjs",
  "docs/lockdown/TEST-LABEL-G1-AND-CUTOVER-FALSE-ALARM-LAW-2026-08-28.md",
  "docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md",
  "docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0007-G1-LABEL.md",
]);

const BULK = [
  /SET\s+voided_at[\s\S]{0,400}is_sample_data/i,
  /WHERE[\s\S]{0,200}is_sample_data[\s\S]{0,200}SET\s+voided_at/i,
  /DELETE\s+FROM[\s\S]{0,300}is_sample_data/i,
  /bulkVoid|voidAllSample|void_all_test|purgeSample/i,
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(mjs|ts|tsx|sql|md)$/.test(ent.name)) out.push(p);
  }
  return out;
}

export function assertNoBulkTestVoid(root = ROOT) {
  const fails = [];
  const roots = ["apps", "scripts", "db/migrations"].map((d) => path.join(root, d)).filter(fs.existsSync);
  const files = roots.flatMap((d) => walk(d));
  for (const abs of files) {
    const rel = path.relative(root, abs).replaceAll("\\", "/");
    if (SKIP.has(rel)) continue;
    if (rel.includes("verify-no-bulk-test-void")) continue;
    const text = fs.readFileSync(abs, "utf8");
    for (const re of BULK) {
      if (re.test(text)) {
        const line = text.split(/\n/).find((l) => re.test(l)) ?? "";
        if (/must not|forbidden|do not void-all|never DELETE.*is_sample_data/i.test(line)) continue;
        if (rel.startsWith("docs/") && /not permitted|NOT permitted|Do not void/i.test(text)) continue;
        fails.push(`${rel}: bulk TEST void/delete pattern ${re}`);
        break;
      }
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".bulk-void-selftest-"));
  const planted = path.join(tmp, "plant-bulk-void.mjs");
  fs.writeFileSync(planted, "await db.query(`UPDATE accounting.bills SET voided_at = now() WHERE is_sample_data`)\n");
  const apps = path.join(tmp, "apps");
  fs.mkdirSync(apps);
  fs.copyFileSync(planted, path.join(apps, "plant-bulk-void.mjs"));
  const found = assertNoBulkTestVoid(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!found.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted bulk void not detected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fails = assertNoBulkTestVoid();
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
