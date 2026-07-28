#!/usr/bin/env node
/**
 * FAILS if a held migration DROPs/re-ADDs chart_of_accounts_roles_role_check
 * without every MUST_KEEP role that is already live on Neon (DISP-01+).
 *
 * Live proof (2026-07-28, br-fancy-credit-akjnd07a, bypass_rls=lucia):
 *   unbilled_revenue is present in accounting.chart_of_accounts_roles AND in the
 *   live CHECK. A widen that omits it rejects existing rows on Neon apply.
 *
 * Static scan only — does not connect to Neon. Extend MUST_KEEP when a new
 * role is proven live before the next widen lands.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "db/migrations");
const heldRegistryPath = path.join(migrationsDir, ".held-migrations.json");

/** Roles proven live on Neon that every *still-held* CoA CHECK rewrite must retain. */
export const MUST_KEEP_ROLES = Object.freeze(["unbilled_revenue", "fixed_asset_default", "accum_depr_default", "depr_expense_default"]);

const REWRITE_MARKERS = [
  /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+chart_of_accounts_roles_role_check/i,
  /ADD\s+CONSTRAINT\s+chart_of_accounts_roles_role_check/i,
];

function heldFilenames() {
  if (!fs.existsSync(heldRegistryPath)) return new Set();
  const reg = JSON.parse(fs.readFileSync(heldRegistryPath, "utf8"));
  const names = new Set();
  for (const row of reg.held || []) {
    const f = typeof row === "string" ? row : row?.file;
    if (f) names.add(f);
  }
  return names;
}

export function run(opts = {}) {
  const failures = [];
  if (!fs.existsSync(migrationsDir)) {
    failures.push("db/migrations missing");
    return failures;
  }
  const held = heldFilenames();
  if (!held.size) {
    failures.push(".held-migrations.json held[] empty/unreadable");
    return failures;
  }
  // Only still-unapplied held files — historical applied widens are frozen ledger.
  for (const file of [...held].sort()) {
    const full = path.join(migrationsDir, file);
    if (!fs.existsSync(full)) {
      failures.push(`held file missing on disk: ${file}`);
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    const rewrites = REWRITE_MARKERS.every((re) => re.test(text));
    if (!rewrites) continue;
    for (const role of MUST_KEEP_ROLES) {
      const needle = `'${role}'`;
      if (!text.includes(needle)) {
        failures.push(
          `${file}: CoA role CHECK rewrite omits live-required ${needle} (Neon lucia MUST_KEEP)`,
        );
      }
    }
  }
  if (opts.throwOnFail && failures.length) {
    throw new Error(
      "coa-role-check-held-superset FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "),
    );
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("verify-coa-role-check-held-superset.mjs")) {
  const f = run();
  if (f.length) {
    console.error("verify-coa-role-check-held-superset FAIL:");
    for (const x of f) console.error("  ✗", x);
    process.exit(1);
  }
  console.log(
    `verify-coa-role-check-held-superset OK — MUST_KEEP=[${MUST_KEEP_ROLES.join(",")}].`,
  );
}
