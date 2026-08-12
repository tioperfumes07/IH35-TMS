#!/usr/bin/env node
/**
 * LV-REIMBURSEMENT-FLAG-NEVER-SEEDED — class guard.
 *
 * `REIMBURSEMENT_GL_POSTING_ENABLED` was read by the reimbursement poster
 * (`isEnabled(client, REIMBURSEMENT_GL_POSTING_FLAG, ...)`) but never inserted into
 * `lib.feature_flags`. `lib/feature-flags/service.ts`'s `isEnabled()` short-circuits
 * `if (!flag) return false` BEFORE any per-entity override is even consulted — so this was not
 * "off, flip it when ready", there was NO ROW TO FLIP and no override could ever turn it on.
 * Live-proven on prod 2026-08-07: a driver reimbursement posted `paid` with `journal_entry_id NULL`,
 * permanently unpostable, for every entity, silently.
 *
 * Every existing flag-specific guard in this repo (verify-*-flag-gate.mjs) asserts ONE flag's
 * behavior once it exists; none of them asks "does every flag key the BACKEND SOURCE reads actually
 * have a row" — so a newly-declared, never-seeded flag is invisible to all of them. This is that check.
 *
 * METHOD (static two-pass extraction, matching how `isEnabled()` is actually called in this
 * codebase — sometimes a direct string literal, more often a named constant):
 *   Pass 1 — every `const NAME = "FLAG_KEY"` declaration (exported or not) across apps/backend/src,
 *            building a constant-name -> flag-key map.
 *   Pass 2 — every `isEnabled(client, ARG, ...)` call site; ARG is either a direct string literal
 *            (used as-is) or an identifier (resolved through the pass-1 map).
 *   Compare the resulting flag-key set against live `lib.feature_flags.flag_key` rows.
 *
 * DB-BACKED (needs DATABASE_URL) — SKIPs cleanly with no DB, same posture as every other live guard
 * in this suite (verify-no-future-dated-or-untagged-sample-money.mjs et al.), so it never fakes green
 * in a no-DB context and never fails a fresh-DB / no-DB CI job.
 *
 * Self-test: node scripts/verify-flag-keys-seeded.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "verify-flag-keys-seeded";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC_DIR = path.join(ROOT, "apps", "backend", "src");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$|\.deprecated\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extracts the set of flag keys referenced via isEnabled() calls across the given file contents.
 * Exported so the selftest can exercise it against inline fixtures without touching the filesystem.
 */
export function extractReferencedFlagKeys(filesContent) {
  const constMap = new Map(); // constName -> "FLAG_KEY"
  const constDeclRe = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=\n]+)?=\s*["']([A-Z][A-Z0-9_]{2,})["']/g;
  for (const src of filesContent) {
    let m;
    while ((m = constDeclRe.exec(src))) {
      constMap.set(m[1], m[2]);
    }
  }

  const referenced = new Set();
  const unresolved = [];
  // isEnabled(client, ARG, ...) — ARG is a string literal or an identifier. Deliberately does not
  // try to resolve member-expressions (obj.FLAG) or ternaries — those are rare enough in this
  // codebase that a false negative (missed reference) is safer than a false positive (fabricated key).
  const callRe = /isEnabled\(\s*[^,]+,\s*(?:["']([A-Z][A-Z0-9_]{2,})["']|([A-Za-z_][A-Za-z0-9_]*))/g;
  for (const src of filesContent) {
    let m;
    while ((m = callRe.exec(src))) {
      if (m[1]) {
        referenced.add(m[1]);
      } else if (m[2]) {
        const resolved = constMap.get(m[2]);
        if (resolved) referenced.add(resolved);
        else unresolved.push(m[2]);
      }
    }
  }
  return { referenced, unresolved };
}

// Guards the whole entry-point block (selftest + live check) so that IMPORTING this file for its
// exported pure function (extractReferencedFlagKeys — used by a one-off verification script, or a
// future sibling guard) never triggers a DB connection attempt or a --selftest run as a side effect.
const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const fixtureDirect = `await isEnabled(client, "DIRECT_LITERAL_ENABLED", { operating_company_id: oc });`;
  const fixtureConst = `
    export const MY_POSTER_FLAG_KEY = "MY_POSTER_GL_POSTING_ENABLED";
    async function run(client) {
      await isEnabled(client, MY_POSTER_FLAG_KEY, {});
    }
  `;
  const fixtureUnresolved = `await isEnabled(client, someRuntimeVar, {});`;

  const good = extractReferencedFlagKeys([fixtureDirect, fixtureConst]);
  if (!good.referenced.has("DIRECT_LITERAL_ENABLED")) fail("selftest: direct string-literal isEnabled() arg not extracted");
  if (!good.referenced.has("MY_POSTER_GL_POSTING_ENABLED")) fail("selftest: const-resolved isEnabled() arg not extracted — two-pass resolution is inert");

  const unresolvedCheck = extractReferencedFlagKeys([fixtureUnresolved]);
  if (unresolvedCheck.referenced.size !== 0) fail("selftest: an unresolvable runtime identifier was fabricated into a flag key");
  if (unresolvedCheck.unresolved.length !== 1) fail("selftest: unresolved identifier was not reported for visibility");

  // Regression fixture: the ACTUAL defect shape — a flag declared and referenced via a const, so the
  // extractor MUST resolve the indirection (this is exactly how REIMBURSEMENT_GL_POSTING_FLAG is used
  // in the real driver-reimbursement.service.ts).
  const regression = `
    export const REIMBURSEMENT_GL_POSTING_FLAG = "REIMBURSEMENT_GL_POSTING_ENABLED";
    async function payDriverReimbursementImmediately(client) {
      const enabled = await isEnabled(client, REIMBURSEMENT_GL_POSTING_FLAG, { operating_company_id: oc });
    }
  `;
  const regr = extractReferencedFlagKeys([regression]);
  if (!regr.referenced.has("REIMBURSEMENT_GL_POSTING_ENABLED")) {
    fail("selftest: regression fixture (the real defect's exact shape) was not extracted — guard would have missed the original bug");
  }

  console.log(`[${LABEL}] selftest: PASS — direct literal, const-resolved, and unresolvable-identifier cases all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`[${LABEL}] SKIP — no DATABASE_URL (static context); this guard is DB-backed by design`);
    process.exit(0);
  }

  const files = walk(SRC_DIR);
  const contents = files.map((f) => fs.readFileSync(f, "utf8"));
  const { referenced, unresolved } = extractReferencedFlagKeys(contents);

  if (referenced.size === 0) {
    fail("extracted ZERO flag keys from apps/backend/src — extraction is broken (isEnabled is used hundreds of times in this codebase)");
  }

  const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
  let client;
  try {
    client = await pool.connect();
  } catch {
    console.log(`[${LABEL}] SKIP — database unreachable (static context)`);
    process.exit(0);
  }

  try {
    const { rows } = await client.query(`SELECT flag_key FROM lib.feature_flags`);
    const seeded = new Set(rows.map((r) => r.flag_key));

    if (seeded.size === 0) {
      fail("lib.feature_flags read 0 rows — that is an unverifiable read (RLS mask or empty table), not evidence every flag is seeded.");
    }

    const missing = [...referenced].filter((k) => !seeded.has(k)).sort();
    if (missing.length > 0) {
      console.error(`[${LABEL}] FAIL — ${missing.length} flag key(s) referenced in backend source but never seeded in lib.feature_flags:`);
      for (const k of missing) console.error(`  - ${k}`);
      console.error(
        `[${LABEL}] a code path gated on one of these can NEVER be turned on — isEnabled() short-circuits false before any override is consulted. Seed each via an idempotent migration (default_enabled=false).`
      );
      fail(`${missing.length} unseeded flag key(s)`);
    }

    console.log(
      `[${LABEL}] PASS — ${referenced.size} flag key(s) referenced in apps/backend/src all have a lib.feature_flags row (${unresolved.length} dynamic/unresolvable reference(s) skipped, by design)`
    );
  } catch (err) {
    fail(`query failed: ${err?.message ?? err}`);
  } finally {
    client.release();
    await pool.end();
  }
}
