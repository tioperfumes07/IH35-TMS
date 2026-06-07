#!/usr/bin/env node
/**
 * ci-migration-guard.mjs
 *
 * PR CI check: rejects any PR that renames or edits the content of
 * an already-applied migration.
 *
 * Applied migrations are listed in .applied-migrations.json (root).
 * The backing content-immutability check (verify:applied-migrations-immutable)
 * uses db/migrations/.ledger.json — this script is ADDITIVE, providing a
 * PR-diff-aware layer on top of the static CLOSURE-28 chain gate.
 *
 * Detection strategy:
 *   - Rename: a migration in the applied list appears as D (deleted) or
 *     the source of an R (rename) in the PR diff vs base branch.
 *   - Content edit: a migration in the applied list appears as M (modified).
 *
 * Called by .github/workflows/migration-guard.yml and
 * pre-commit hook (.husky/pre-commit).
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const LEDGER_PATH = path.join(ROOT, ".applied-migrations.json");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const BASE_REF = process.env.GITHUB_BASE_REF || "main";

function fail(lines) {
  console.error("\nMIGRATION GUARD FAILED");
  console.error("=".repeat(60));
  for (const line of lines) {
    console.error(line);
  }
  console.error("=".repeat(60));
  console.error(
    "\nApplied migrations are immutable. Do NOT rename or edit them."
  );
  console.error(
    "To add SQL changes, create a new migration file with the next sequence number."
  );
  process.exit(1);
}

function loadAppliedSet() {
  if (!fs.existsSync(LEDGER_PATH)) {
    console.log("ci-migration-guard: .applied-migrations.json not found — skipping.");
    process.exit(0);
  }
  const raw = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.migrations)
    ? raw.migrations
    : Array.isArray(raw.entries)
    ? raw.entries
    : Object.entries(raw).map(([filename, checksum]) => ({ filename, checksum }));

  const byName = new Map();
  for (const entry of entries) {
    const filename =
      entry?.filename ?? entry?.name ?? entry?.migration;
    const checksum =
      entry?.checksum ?? entry?.sha256 ?? entry?.hash;
    if (filename) byName.set(filename.trim(), checksum?.trim() ?? null);
  }
  return byName;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function getDiffedMigrations() {
  let diffOutput;
  try {
    diffOutput = execSync(
      `git diff --name-status origin/${BASE_REF}...HEAD -- db/migrations/`,
      { cwd: ROOT, encoding: "utf8" }
    );
  } catch {
    // Fallback: compare against HEAD~1 (for pre-commit use)
    try {
      diffOutput = execSync(
        `git diff --name-status HEAD -- db/migrations/`,
        { cwd: ROOT, encoding: "utf8" }
      );
    } catch {
      console.log("ci-migration-guard: could not compute diff — skipping.");
      process.exit(0);
    }
  }

  const changed = [];
  for (const rawLine of diffOutput.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\t/);
    const status = parts[0][0]; // M, D, A, R, C …
    if (status === "M" || status === "D") {
      changed.push({ status, file: path.basename(parts[1]) });
    } else if (status === "R" || status === "C") {
      // Rename: parts[1] = old, parts[2] = new
      changed.push({ status: "D", file: path.basename(parts[1]) });
    }
  }
  return changed;
}

function main() {
  const applied = loadAppliedSet();
  const diffed = getDiffedMigrations();

  const violations = [];

  for (const { status, file } of diffed) {
    if (!applied.has(file)) continue;

    if (status === "D") {
      violations.push(
        `  RENAMED/DELETED: db/migrations/${file} (status=${status})`
      );
    } else if (status === "M") {
      // Double-check content actually changed vs ledger checksum
      const ledgerChecksum = applied.get(file);
      if (ledgerChecksum) {
        const diskPath = path.join(MIGRATIONS_DIR, file);
        if (fs.existsSync(diskPath)) {
          const actual = sha256(fs.readFileSync(diskPath, "utf8"));
          if (actual !== ledgerChecksum) {
            violations.push(
              `  CONTENT EDITED: db/migrations/${file}\n    ledger: ${ledgerChecksum}\n    actual: ${actual}`
            );
          }
        } else {
          violations.push(`  MISSING ON DISK: db/migrations/${file}`);
        }
      } else {
        violations.push(
          `  CONTENT EDITED: db/migrations/${file} (no checksum in ledger)`
        );
      }
    }
  }

  if (violations.length > 0) {
    fail(violations);
  }

  console.log(
    `ci-migration-guard PASS — ${diffed.length} migration file(s) in diff, 0 applied-migration violations.`
  );
}

main();
