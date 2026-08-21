#!/usr/bin/env node
/**
 * ACCT-F5681 — the driver-escrow grandparent resolver must recognize a documented, entity-scoped
 * alias name for the SAME locked §9.4 concept ("Driver Escrow liability") when the exact primary
 * name ("Damage Claim Escrow", TRANSP's QBO-mirrored label) is absent — without renaming the real
 * account (Rule 19: never reclassify/rename an owner-created reserve account unilaterally) and
 * without touching resolveCanonicalParentAccount's generic, single-name contract (used elsewhere
 * for the UNRELATED asset-parent lookup, which must NOT gain alias behavior it never asked for).
 *
 * Locked here (driver-subaccount-provision.service.ts):
 *   1. an alias list constant exists and is non-empty;
 *   2. resolveDriverEscrowParentId tries the primary name FIRST, falls back to the alias list only
 *      when the primary resolves to null (never the reverse — an entity that already has the
 *      canonical name must never be redirected to an alias);
 *   3. the fallback is entity-scoped (operatingCompanyId threaded to every attempt);
 *   4. resolveCanonicalParentAccount itself is UNCHANGED (single accountName param, no alias
 *      awareness) — the generalization lives only in the escrow-specific caller.
 *
 * Run:  node scripts/verify-driver-escrow-grandparent-alias-resolution.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-escrow-grandparent-alias-resolution";
const FILE = "apps/backend/src/accounting/driver-subaccount-provision.service.ts";

export function analyze(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/const DRIVER_ESCROW_GRANDPARENT_ALIASES: readonly string\[\] = \[[^\]]+\]/.test(code)) {
    failures.push(`${FILE}: DRIVER_ESCROW_GRANDPARENT_ALIASES must exist and be non-empty.`);
  }
  const fnMatch = /export async function resolveDriverEscrowParentId[\s\S]*?\n\}/.exec(code);
  const fn = fnMatch ? fnMatch[0] : "";
  if (!/let grandparentId = await resolveCanonicalParentAccount\(client, \{\s*\n\s*accountName: DRIVER_ESCROW_GRANDPARENT_NAME,/.test(fn)) {
    failures.push(`${FILE}: resolveDriverEscrowParentId must try the PRIMARY name first (accountName: DRIVER_ESCROW_GRANDPARENT_NAME on the initial call), not jump straight to an alias.`);
  }
  if (!/for \(let i = 0; !grandparentId && i < DRIVER_ESCROW_GRANDPARENT_ALIASES\.length/.test(fn)) {
    failures.push(`${FILE}: the alias fallback must run ONLY when the primary lookup returned null (!grandparentId guard) — never unconditionally.`);
  }
  if (!/operatingCompanyId: args\.operatingCompanyId,\s*\n\s*\}\);\s*\n\s*\}/.test(fn)) {
    failures.push(`${FILE}: the alias fallback loop must thread operatingCompanyId to every attempt — an unscoped fallback could resolve another entity's account.`);
  }
  const genericFnMatch = /export async function resolveCanonicalParentAccount[\s\S]*?\n\}/.exec(code);
  const genericFn = genericFnMatch ? genericFnMatch[0] : "";
  if (/ALIASES|alias/i.test(genericFn)) {
    failures.push(`${FILE}: resolveCanonicalParentAccount (the SHARED generic resolver, also used by the unrelated asset-parent lookup) must remain alias-unaware — the generalization belongs only in the escrow-specific caller.`);
  }
  return failures;
}

export function run() {
  return analyze(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL file should PASS but failed: ${good.join("; ")}`);

  const m1 = real.replace(/const DRIVER_ESCROW_GRANDPARENT_ALIASES: readonly string\[\] = \[[^\]]+\];/, "const DRIVER_ESCROW_GRANDPARENT_ALIASES: readonly string[] = [];");
  if (!analyze(m1).some((f) => f.includes("non-empty"))) {
    throw new Error(`[${LABEL}] selftest: emptied alias list should FAIL but passed`);
  }

  const m2 = real.replace(
    "let grandparentId = await resolveCanonicalParentAccount(client, {\n    accountName: DRIVER_ESCROW_GRANDPARENT_NAME,",
    "let grandparentId = await resolveCanonicalParentAccount(client, {\n    accountName: DRIVER_ESCROW_GRANDPARENT_ALIASES[0],"
  );
  if (m2 === real) throw new Error(`[${LABEL}] selftest: mutation 2's target string was not found in the real file — fix the mutation`);
  if (!analyze(m2).some((f) => f.includes("PRIMARY name first"))) {
    throw new Error(`[${LABEL}] selftest: primary-name-skip mutation should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — real green; emptied-alias-list and skip-primary mutations both red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — the escrow grandparent resolver falls back to a documented, entity-scoped alias only after the primary name misses, and the shared generic resolver stays alias-unaware`);
