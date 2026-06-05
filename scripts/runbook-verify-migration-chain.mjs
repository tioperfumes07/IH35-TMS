#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(".");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const MIGRATION_FILENAME = /^(\d{4})([a-z]?)_.+\.sql$/i;
const KNOWN_MAX_MIGRATION_NUMBER = 396;
const KNOWN_MISSING_NUMBERS = new Set([
  47, 63, 64, 76, 77, 78, 84, 119, 120, 121, 122, 130, 132, 134, 139, 147, 148, 149, 225, 226, 227, 228, 239,
  243, 244, 245, 251, 252, 253, 254, 255, 259, 278, 279, 297, 305, 312, 314, 315, 316, 317, 322, 324, 326, 327,
  328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 341, 346, 351, 352, 364, 390, 392, 394, 395,
]);

function fail(message) {
  console.error(`runbook:verify-migration-chain FAIL\n- ${message}`);
  process.exit(1);
}

function runStaticGuard(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    fail(`static guard failed (${scriptPath})\n${output}`);
  }
}

function parseMigration(file) {
  const match = file.match(MIGRATION_FILENAME);
  if (!match) return null;
  return {
    file,
    number: Number(match[1]),
    suffix: (match[2] ?? "").toLowerCase(),
  };
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return String(result.stdout ?? "");
}

function collectMainlineContext() {
  const filesOutput = commandOutput("git", ["ls-tree", "-r", "--name-only", "origin/main", "db/migrations"]);
  if (!filesOutput) return null;
  const files = filesOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".sql"))
    .map((line) => path.basename(line));
  const parsed = files.map(parseMigration).filter(Boolean);
  if (parsed.length === 0) return null;
  const mainMax = Math.max(...parsed.map((item) => item.number));

  const diffOutput = commandOutput("git", ["diff", "--name-status", "origin/main...HEAD", "--", "db/migrations"]);
  const added = [];
  if (diffOutput) {
    for (const line of diffOutput.split(/\r?\n/).map((v) => v.trim()).filter(Boolean)) {
      const parts = line.split(/\s+/);
      const status = parts[0];
      const filePath = parts.at(-1) ?? "";
      if (!status.startsWith("A")) continue;
      if (!filePath.endsWith(".sql")) continue;
      const parsedFile = parseMigration(path.basename(filePath));
      if (parsedFile) added.push(parsedFile);
    }
  }

  return { mainMax, added };
}

if (!fs.existsSync(MIGRATIONS_DIR)) fail("missing db/migrations directory");

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((file) => MIGRATION_FILENAME.test(file))
  .sort((a, b) => a.localeCompare(b));

if (migrationFiles.length === 0) fail("no migration files found");

const parsed = migrationFiles.map(parseMigration).filter(Boolean);
const numbers = [...new Set(parsed.map((item) => item.number))].sort((a, b) => a - b);
const maxNumber = Math.max(...numbers);
const present = new Set(numbers);
const gaps = [];

for (let n = 1; n <= maxNumber; n += 1) {
  if (!present.has(n)) gaps.push(n);
}

const unexpectedGaps = gaps.filter((n) => !KNOWN_MISSING_NUMBERS.has(n));
if (unexpectedGaps.length > 0) {
  fail(`unexpected migration gaps detected: ${unexpectedGaps.join(", ")}`);
}

const regressions = [];
const mainline = collectMainlineContext();
if (mainline) {
  for (const item of mainline.added) {
    if (item.number < mainline.mainMax) {
      regressions.push(item.file);
    }
  }
}

if (regressions.length > 0) {
  fail(
    `ordering regression: new migration file(s) use numbers lower than current origin/main tail (${regressions.join(", ")})`
  );
}

runStaticGuard(path.join("scripts", "verify-ledger-parity-static.mjs"));
runStaticGuard(path.join("scripts", "verify-no-unledgered-migrations.mjs"));

console.log(
  JSON.stringify({
    event: "runbook_verify_migration_chain_ok",
    migration_count: migrationFiles.length,
    migration_max_number: maxNumber,
    known_gap_count: gaps.length,
    static_guards: ["verify-ledger-parity-static", "verify-no-unledgered-migrations"],
    ordering_check: mainline ? "origin-main-diff" : "skipped-no-origin-main-context",
  })
);
