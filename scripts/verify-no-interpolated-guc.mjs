#!/usr/bin/env node
/**
 * verify-no-interpolated-guc — SECURITY GATE against authenticated SQL-injection → RLS bypass.
 *
 * ROOT CAUSE (fixed 2026-07-01): user-controlled values were string-interpolated into
 *   `SET LOCAL app.operating_company_id = '${x}'`
 * and executed over node-pg's SIMPLE-query protocol, which runs multiple `;`-separated statements.
 * Because is_lucia_bypass() = (current_setting('app.bypass_rls') = 'lucia'), a payload like
 *   operating_company_id = x';SET app.bypass_rls='lucia';--
 * disables RLS on the pooled connection → cross-tenant read/write.
 *
 * FIX: every GUC set must be PARAMETERIZED — bound via a placeholder, never interpolated:
 *   await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
 *
 * This guard FAILS (exit 1) if ANY `SET ... app.<guc>` or `set_config(...)` statement in
 * apps/backend/src contains a `${...}` template interpolation. ALLOWLIST: none.
 *
 * NOT flagged (out of scope — not app.* GUCs, hardcoded/sanitized): `SET ROLE ${APP_DB_ROLE}`
 * (constant role name) and `SAVEPOINT ${safe}` (regex-sanitized identifier).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");

// (A) A `SET [LOCAL|SESSION] app.<guc> = ...` whose value is interpolated (`${`).
const SET_APP_GUC_INTERP = /\bSET\b(?:\s+(?:LOCAL|SESSION))?\s+app\.[a-z_]+\s*=\s*['"]?\$\{/gi;
// (B) A `set_config( ... )` call with any `${` interpolation among its arguments (name OR value).
//     The safe bound form — set_config('app.x', $1, true) — uses `$1`, which does NOT match `${`.
const SET_CONFIG_INTERP = /\bset_config\s*\([^)]*\$\{/gi;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

const hits = [];
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  for (const re of [SET_APP_GUC_INTERP, SET_CONFIG_INTERP]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      hits.push(`${rel}:${lineOf(src, m.index)}: ${m[0].replace(/\s+/g, " ").trim()}…`);
    }
  }
}

if (hits.length) {
  console.error("verify-no-interpolated-guc FAILED:");
  console.error(
    `  ${hits.length} interpolated GUC set(s) found. User-controlled interpolation into a SET/set_config`
  );
  console.error(
    `  statement is an authenticated SQLi→RLS-bypass sink. Parameterize instead:`
  );
  console.error(
    `    await client.query("SELECT set_config('app.<guc>', $1, true)", [value]);`
  );
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}

console.log("verify-no-interpolated-guc OK — no interpolated GUC set/set_config statements in apps/backend/src.");
