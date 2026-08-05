#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function scan(root = ROOT) {
  const bad = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && e.name !== "node_modules" && e.name !== "__tests__") walk(p);
      else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) {
        const rel = path.relative(root, p).replace(/\\/g, "/");
        const s = fs.readFileSync(p, "utf8");
        if (!/listInsurancePolicies\b/.test(s)) continue;
        if (/kind=["']insurance_policy["']/.test(s)) continue;
        // Fail only when a <select> binds policy_id (FK picker), not filter/status selects.
        if (/<select[\s\S]{0,400}policy_id/.test(s)) bad.push(rel);
      }
    }
  }
  walk(path.join(root, "apps/frontend/src"));
  return bad;
}
if (process.argv.includes("--selftest")) {
  if (scan().length === 0) {
    console.log("SELFTEST OK");
    process.exit(0);
  }
  process.exit(1);
}
const b = scan();
if (b.length) {
  console.error("FAIL", b.join("\n"));
  process.exit(1);
}
console.log("OK");
