#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_CHANGED_FILES = [
  /(^|\/)catalogs\.maintenance_parts(\.|\/|$)/,
  /(^|\/)catalogs\/maintenance_parts(\.|\/|$)/,
  /(^|\/)catalogs\.parts(\.|\/|$)/,
  /(^|\/)catalogs\/parts(\.|\/|$)/,
  /(^|\/)maintenance\.parts_inventory(\.|\/|$)/,
  /(^|\/)maintenance\/parts_inventory(\.|\/|$)/,
  /(^|\/)maint\.part(\.|\/|$)/,
  /(^|\/)maint\/part(\.|\/|$)/,
];

function fail(message) {
  console.error(`verify:oem-parts-no-touch-existing-parts-surfaces FAIL: ${message}`);
  process.exit(1);
}

const diff = spawnSync("git", ["diff", "origin/main..HEAD", "--name-only"], {
  cwd: ROOT,
  encoding: "utf8",
});

if (diff.status !== 0) {
  fail(diff.stderr || diff.stdout || "git diff failed");
}

const changedFiles = diff.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (changedFiles.length === 0) {
  console.log("verify:oem-parts-no-touch-existing-parts-surfaces PASS (no diff vs origin/main)");
  process.exit(0);
}

for (const file of changedFiles) {
  for (const pattern of FORBIDDEN_CHANGED_FILES) {
    if (pattern.test(file)) {
      fail(`forbidden inventory surface file touched: ${file}`);
    }
  }
}

console.log("verify:oem-parts-no-touch-existing-parts-surfaces PASS");
