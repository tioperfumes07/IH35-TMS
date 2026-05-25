#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.resolve(ROOT, "db/migrations");
const LEDGER_PATH = path.resolve(MIGRATIONS_DIR, ".ledger.json");
const MIGRATION_FILE_PATTERN = /^\d{4}[a-z]?_.+\.sql$/i;

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function fail(messageLines) {
  console.error("verify:applied-migrations-immutable FAILED");
  for (const line of messageLines) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

function parseLedgerEntries(raw) {
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed.migrations)) {
    return parsed.migrations;
  }
  if (Array.isArray(parsed.entries)) {
    return parsed.entries;
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([filename, checksum]) => ({ filename, checksum }));
  }
  throw new Error("unsupported ledger JSON shape");
}

function normalizeLedgerEntry(entry) {
  const filename = entry?.filename ?? entry?.name ?? entry?.migration;
  const checksum = entry?.checksum ?? entry?.sha256 ?? entry?.hash;
  if (typeof filename !== "string" || typeof checksum !== "string") {
    return null;
  }
  return {
    filename: filename.trim(),
    checksum: checksum.trim(),
  };
}

function readLedger(ledgerPath) {
  const raw = fs.readFileSync(ledgerPath, "utf8");
  const normalized = parseLedgerEntries(raw)
    .map((entry) => normalizeLedgerEntry(entry))
    .filter(Boolean);
  return normalized;
}

export function verifyAppliedMigrationsImmutable({ migrationsDir = MIGRATIONS_DIR, ledgerPath = LEDGER_PATH } = {}) {
  if (!fs.existsSync(ledgerPath)) {
    return {
      ok: true,
      skipped: true,
      reason: "ledger missing",
      checked: 0,
      mismatches: [],
    };
  }

  const entries = readLedger(ledgerPath).filter((entry) => MIGRATION_FILE_PATTERN.test(entry.filename));
  const mismatches = [];

  for (const entry of entries) {
    const filePath = path.resolve(migrationsDir, entry.filename);
    if (!fs.existsSync(filePath)) {
      mismatches.push({
        filename: entry.filename,
        ledgerChecksum: entry.checksum,
        diskChecksum: "MISSING",
      });
      continue;
    }
    const diskSql = fs.readFileSync(filePath, "utf8");
    const diskChecksum = sha256(diskSql);
    if (diskChecksum !== entry.checksum) {
      mismatches.push({
        filename: entry.filename,
        ledgerChecksum: entry.checksum,
        diskChecksum,
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    skipped: false,
    checked: entries.length,
    mismatches,
  };
}

const result = verifyAppliedMigrationsImmutable();

if (result.skipped) {
  console.warn(
    "verify:applied-migrations-immutable SKIP — db/migrations/.ledger.json not found; guard is enforced when ledger exists."
  );
  process.exit(0);
}

if (!result.ok) {
  const lines = [];
  for (const mismatch of result.mismatches) {
    lines.push(
      `${mismatch.filename}: ledger sha=${mismatch.ledgerChecksum} disk sha=${mismatch.diskChecksum}. Applied migrations are immutable. To change behavior, add a NEW migration with the next available number. Do not modify ${mismatch.filename}.`
    );
  }
  fail(lines);
}

console.log(`verify:applied-migrations-immutable OK — checked=${result.checked}`);
