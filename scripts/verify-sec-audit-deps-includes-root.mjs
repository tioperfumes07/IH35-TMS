#!/usr/bin/env node
// verify:sec-audit-deps-includes-root
// Guard: scripts/sec-audit-deps-cve-scan.mjs MUST audit the repo root package.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "scripts/sec-audit-deps-cve-scan.mjs";

if (process.argv.includes("--selftest")) {
  const planted = `export const PACKAGES = [
  { name: "backend", cwd: path.join(ROOT, "apps/backend") },
];\n`;
  if (/name:\s*["']root["']/.test(planted)) {
    console.error("selftest FAIL — planted omit-root sample unexpectedly matched root");
    process.exit(1);
  }
  console.log("verify:sec-audit-deps-includes-root --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const failures = [];
if (!/name:\s*["']root["']/.test(src)) {
  failures.push("PACKAGES must include an entry with name: \"root\"");
}
if (!/cwd:\s*ROOT/.test(src) && !/cwd:\s*path\.resolve\(ROOT/.test(src)) {
  // allow cwd: ROOT literal in the packages array
  if (!/\{\s*name:\s*["']root["']\s*,\s*cwd:\s*ROOT\s*\}/.test(src.replace(/\s+/g, " "))) {
    failures.push("root package cwd must be ROOT");
  }
}

const mod = await import(pathToFileURL(path.join(ROOT, FILE)).href);
try {
  mod.assertRootPackageAudited(mod.PACKAGES);
} catch (err) {
  failures.push(String(err?.message ?? err));
}

if (failures.length > 0) {
  console.error("verify:sec-audit-deps-includes-root FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("verify:sec-audit-deps-includes-root PASS");
