#!/usr/bin/env node
// GATE-SCOPE-02 — DATA_WRITE_PATHS (["db/migrations/", "scripts/ops/"] in money-pr-local-gate.mjs)
// is a path PREFIX, not a promise the file writes anything. Blindly spreading it into every
// LIVE_DOMAIN_GUARDS entry's `prefixes` list meant ANY file under either prefix forced every
// live-domain guard to run, regardless of what that file actually does — confirmed live blocking
// three different seats on three different non-writing files in the same push:
//   db/migrations/CLAIMED-MIGRATION-NUMBERS.json — a claim registry, not a migration (no SQL, no
//     schema change, no DB write of any kind).
//   scripts/ops/settlement-truth-target.mjs — reads a static JSON file, imports no DB client.
// This is GATE-SCOPE-01's OTHER half: that fix corrected WHEN a touched guard runs (never on a
// live DB's mere presence); this corrects WHAT counts as "touched" via DATA_WRITE_PATHS in the
// first place — a path match, not a content promise.
//
// Exported so scripts/money-pr-local-gate.mjs and its own guard
// (scripts/verify-data-write-path-detection-is-content-based.mjs) share ONE implementation —
// never two copies that can drift.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DATA_WRITE_PATHS = ["db/migrations/", "scripts/ops/"];

// (a) escape hatch, explicit read-only manifest for edge cases the content check gets wrong in
// either direction (a real writer the regex misses, e.g. an indirect DB call through a wrapper
// with no literal "pg"/"Client"/"Pool"/"DATABASE_URL" token; or a false-positive match, e.g. a
// comment or string literal that merely mentions one of those tokens without ever connecting).
export const READ_ONLY_MANIFEST_REL = "scripts/lib/data-write-path-read-only-manifest.json";

const DB_CLIENT_RE = /\b(?:require\(\s*["']pg["']\s*\)|from\s+["']pg["']|new\s+(?:Client|Pool)\s*\(|process\.env\.DATABASE_URL)\b/;
const DB_WRITE_RE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(?:accounting|mdata|fuel|driver_finance|banking|catalogs)\./i;

function readReadOnlyManifest(root) {
  const abs = path.join(root, READ_ONLY_MANIFEST_REL);
  if (!existsSync(abs)) return { read_only: [], forced_write: [] };
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf8"));
    return { read_only: parsed.read_only ?? [], forced_write: parsed.forced_write ?? [] };
  } catch {
    return { read_only: [], forced_write: [] };
  }
}

/**
 * Does this file under a DATA_WRITE_PATHS prefix actually write to a database? `relPath` is
 * repo-relative (matches `git diff --name-only` output). `root` is the repo root (absolute).
 *
 * A real `.sql` file under `db/migrations/` IS a migration by definition — schema-altering SQL,
 * always a real write, checked unconditionally (a content regex written for JS import syntax would
 * never match raw SQL and would silently defeat the guard's primary, most common case). Every other
 * file under either DATA_WRITE_PATHS prefix — non-.sql files in db/migrations/ (the claim registry),
 * and every file under scripts/ops/ (a real mix: some write, most don't) — is content-checked: does
 * it import a DB client (pg's Client/Pool, or read DATABASE_URL directly)? The manifest escape hatch
 * overrides either direction for a case the regex gets wrong.
 */
export function dataWritePathFileActuallyWrites(relPath, root) {
  const manifest = readReadOnlyManifest(root);
  if (manifest.read_only.includes(relPath)) return false;
  if (manifest.forced_write.includes(relPath)) return true;
  if (relPath.startsWith("db/migrations/") && relPath.endsWith(".sql")) return true;
  const abs = path.join(root, relPath);
  if (!existsSync(abs)) return false; // deleted file — nothing left to trigger on
  let source;
  try {
    source = readFileSync(abs, "utf8");
  } catch {
    return true; // unreadable — fail toward triggering, never toward a silent skip
  }
  return DB_CLIENT_RE.test(source);
}

/**
 * Does the actual added diff for a DATA_WRITE_PATHS file introduce a financial DB write?
 * Existing writers frequently receive documentation, authorization, or safety-only edits; scanning
 * their whole post-edit contents incorrectly treats those harmless hunks as a new money write.
 */
export function dataWritePathDiffActuallyWrites(relPath, root, diffText) {
  const manifest = readReadOnlyManifest(root);
  if (manifest.read_only.includes(relPath)) return false;
  if (manifest.forced_write.includes(relPath)) return true;
  if (relPath.startsWith("db/migrations/") && relPath.endsWith(".sql")) return true;
  const added = String(diffText ?? "")
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
  return DB_WRITE_RE.test(added);
}

/** True if `relPath` is under any DATA_WRITE_PATHS prefix at all (path-only, no content check). */
export function isUnderDataWritePath(relPath) {
  return DATA_WRITE_PATHS.some((p) => relPath.startsWith(p));
}
