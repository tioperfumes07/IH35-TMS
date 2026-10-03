// ROUND 365.1 (CC-1) — the role is the contract, down to the resolver itself. Every poster resolves through
// coa-roles/resolver.service.ts; the full poster sweep + live role map is
// scripts/verify-every-poster-resolves-by-role-not-by-name-or-number.mjs (CC-3, live, run in the gate). This step is its
// import-safe static half for the resolver: an UNBOUND role must resolve to null (the poster refuses, naming the role)
// — never to a look-alike account found by account_name ILIKE or account_subtype / account_type (the ROLE_FALLBACKS
// tier removed 2026-10-03, which resolved revenue_default to ANY Income account).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";

export function resolverProblems(raw) {
  const out = [];
  // comments may describe the removed fallback; only code counts
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  if (/account_name\s+ILIKE/i.test(src)) out.push("resolver resolves an account by account_name ILIKE");
  if (/account_subtype\s*=\s*ANY\(|account_type\s*=\s*ANY\(/i.test(src)) out.push("resolver resolves an account by account_subtype / account_type shape");
  if (/ROLE_FALLBACKS\s*\[|resolveFallbackByAccountShape\s*\(|listFallbackAccountIds\s*\(/.test(src)) out.push("resolver still calls a shape / name fallback tier");
  const optional = src.match(/export async function resolveRoleAccountOptional\([\s\S]*?\n}\n/);
  if (!optional) out.push("resolveRoleAccountOptional not found");
  else if (!/return null;[^\n]*\n}\n$/.test(optional[0])) out.push("resolveRoleAccountOptional does not end by returning null for an unbound role");
  return out;
}

export default {
  name: "every-poster-resolves-by-role-not-by-name-or-number",
  run: async () => {
    const problems = resolverProblems(readFileSync(resolve(ROOT, RESOLVER), "utf8"));
    // mutants: the rule must catch a reinstated name-hint fallback and a reinstated shape fallback
    const nameMutant = resolverProblems("export async function resolveRoleAccountOptional() {\n  return null;\n}\nconst q = `account_name ILIKE $2`;");
    const shapeMutant = resolverProblems("export async function resolveRoleAccountOptional() {\n  return resolveFallbackByAccountShape(c, o, r);\n}\n");
    if (!nameMutant.length || !shapeMutant.length) problems.push("selftest: a reinstated fallback was not caught");
    if (problems.length) throw new Error("every-poster-resolves-by-role FAIL:\n  " + problems.join("\n  "));
  },
};
