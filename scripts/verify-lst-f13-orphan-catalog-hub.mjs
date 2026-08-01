#!/usr/bin/env node
/**
 * LST-F13 — mounted Lists routes must appear in DOMAIN_CONFIG (hub reachable).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAP = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";

const REQUIRED = [
  { key: "parts-catalog", route: "/lists/maintenance/parts-catalog" },
  { key: "abandonment-defaults", route: "/lists/accounting/abandonment-defaults" },
];

export function run(root = ROOT) {
  const failures = [];
  const abs = path.join(root, MAP);
  if (!fs.existsSync(abs)) {
    failures.push(`missing ${MAP}`);
    return failures;
  }
  const src = fs.readFileSync(abs, "utf8");
  for (const { key } of REQUIRED) {
    if (!src.includes(`catalogKey: "${key}"`)) {
      failures.push(`${MAP}: DOMAIN_CONFIG must include catalogKey "${key}" (LST-F13 hub orphan)`);
    }
  }
  return failures;
}

function selftest() {
  const clean = run();
  if (clean.length) {
    console.error("SELFTEST FAIL: already red:\n  - " + clean.join("\n  - "));
    process.exit(1);
  }
  const abs = path.join(ROOT, MAP);
  const original = fs.readFileSync(abs, "utf8");
  const planted = original.replace(/catalogKey: "parts-catalog"/g, 'catalogKey: "parts-catalog-REMOVED"');
  try {
    fs.writeFileSync(abs, planted);
    const caught = run();
    if (!caught.some((f) => f.includes("parts-catalog"))) {
      console.error("SELFTEST FAIL: planted removal not caught");
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(abs, original);
  }
  console.log("verify-lst-f13-orphan-catalog-hub --selftest OK");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = run();
  if (failures.length) {
    console.error("verify-lst-f13-orphan-catalog-hub FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-lst-f13-orphan-catalog-hub OK — DOMAIN_CONFIG includes mounted hub orphans");
}
