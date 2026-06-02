#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(ROOT, "db", "migrations");
const overridesPath = path.join(ROOT, "scripts", "lib", "migration-checksum-overrides.json");

const files = fs.readdirSync(migrationsDir).filter((n) => n.endsWith(".sql"));
const bad = files.filter((n) => n.includes(" 2.sql") || /\s2\.sql$/i.test(n));

if (bad.length > 0) {
  console.error("verify:ledger-parity-static FAIL: spurious migration filenames:");
  for (const n of bad) console.error(`  ${n}`);
  process.exit(1);
}

if (fs.existsSync(overridesPath)) {
  const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  for (const item of overrides) {
    if (item?.filename?.includes(" 2.sql")) {
      console.error(`verify:ledger-parity-static FAIL: override references spurious file ${item.filename}`);
      process.exit(1);
    }
  }
}

console.log("verify:ledger-parity-static PASS");
