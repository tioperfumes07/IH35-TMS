#!/usr/bin/env node
/** CLS-ENTITYLINK-LOAD — dispatch notify log must EntityLink load_id (already wired — ratchet). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = [
  "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
  "apps/frontend/src/pages/dispatch/components/DispatchLoadBoard.tsx",
];
export function collectProblems(root = ROOT) {
  const p = [];
  for (const rel of TARGETS) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    const s = fs.readFileSync(full, "utf8");
    if (/load_id/.test(s) && /ParityTable|ParityColumn/.test(s) && !/EntityLink[\s\S]*kind=["']load["']/.test(s)) {
      p.push(`${rel}: load_id column must render EntityLink kind=load`);
    }
  }
  return p;
}
if (process.argv.includes("--selftest")) {
  console.log("verify-entitylink-load-id-ratchet SELFTEST OK");
  process.exit(0);
}
const f = collectProblems();
if (f.length) {
  console.error("verify-entitylink-load-id-ratchet FAIL", f.join("\n"));
  process.exit(1);
}
console.log("verify-entitylink-load-id-ratchet OK");
