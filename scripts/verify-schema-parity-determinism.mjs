#!/usr/bin/env node
/**
 * Regression guard for deterministic schema-parity baseline regeneration.
 *
 * The fixture invokes the real verify-schema-parity CLI against an isolated
 * temporary workspace. It never writes the repository's committed baseline.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITER_PATH = path.join(ROOT, "scripts", "verify-schema-parity.mjs");

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function checkWriterSource(source) {
  const executable = withoutComments(source);
  const failures = [];
  if (/\bnew\s+Date\s*\(/.test(executable)) {
    failures.push("schema-parity writer must not construct Date values");
  }
  if (/\.toISOString\s*\(/.test(executable)) {
    failures.push("schema-parity writer must not serialize volatile ISO timestamps");
  }
  if (/(?:\bgenerated_at\b|["']generated_at["'])\s*:/.test(executable)) {
    failures.push("schema-parity writer must not emit a generated_at property");
  }
  return failures;
}

function runCli(root, args) {
  return spawnSync(process.execPath, [WRITER_PATH, ...args, "--root", root], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function assertCliSucceeded(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}):\n${result.stdout}${result.stderr}`);
  }
}

export function runFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-schema-parity-determinism-"));
  try {
    const migrationsDir = path.join(tempRoot, "db", "migrations");
    const docsDir = path.join(tempRoot, "docs");
    const baselinePath = path.join(docsDir, "schema-parity-baseline.json");
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(
      path.join(migrationsDir, "0001_fixture.sql"),
      "CREATE TABLE fixture.widgets (name text, id uuid PRIMARY KEY, created_at timestamptz);\n",
      "utf8",
    );

    const firstUpdate = runCli(tempRoot, ["--update"]);
    assertCliSucceeded(firstUpdate, "first no-op update");
    const firstBytes = fs.readFileSync(baselinePath);

    const secondUpdate = runCli(tempRoot, ["--update"]);
    assertCliSucceeded(secondUpdate, "second no-op update");
    const secondBytes = fs.readFileSync(baselinePath);
    if (!firstBytes.equals(secondBytes)) {
      throw new Error("two consecutive no-op --update regenerations were not byte-identical");
    }

    const baseline = JSON.parse(secondBytes.toString("utf8"));
    if (Object.prototype.hasOwnProperty.call(baseline, "generated_at")) {
      throw new Error("regenerated top-level baseline contains volatile generated_at");
    }
    const expectedTables = {
      "fixture.widgets": ["created_at", "id", "name"],
    };
    if (JSON.stringify(baseline.tables) !== JSON.stringify(expectedTables)) {
      throw new Error(`regenerated tables are not deterministic: ${JSON.stringify(baseline.tables)}`);
    }

    const verify = runCli(tempRoot, []);
    assertCliSucceeded(verify, "verification against deterministic tables");

    fs.writeFileSync(
      baselinePath,
      JSON.stringify({ ...baseline, tables: { "fixture.widgets": ["created_at", "id"] } }, null, 2) + "\n",
      "utf8",
    );
    const plantedTableDrift = runCli(tempRoot, []);
    if (plantedTableDrift.status === 0 || !plantedTableDrift.stderr.includes("COLUMN_NOT_IN_BASELINE")) {
      throw new Error("verification did not consume the planted deterministic tables payload");
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  runExecutableGuard({
    label: "verify-schema-parity-determinism",
    checker: checkWriterSource,
    loadRepositoryFixture: () => fs.readFileSync(WRITER_PATH, "utf8"),
    goodFixture: "return { note: 'stable', tables };",
    badFixture: "return { generated_at: new Date().toISOString(), tables };",
    expectedBadViolationSubstrings: ["Date values", "ISO timestamps", "generated_at"],
  });
  if (process.argv.includes("--selftest") || process.exitCode) return;

  runFixture();
  console.log(
    "verify-schema-parity-determinism PASS — no-op updates byte-identical; volatile metadata absent; tables verified",
  );
}

main();
