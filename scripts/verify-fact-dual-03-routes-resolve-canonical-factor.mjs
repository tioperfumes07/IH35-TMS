#!/usr/bin/env node
/** Ratchet: operational Factoring routes delegate selected-company identity to the canonical resolver. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-dual-03-routes-resolve-canonical-factor";
const FILE = "apps/backend/src/factoring/factoring.routes.ts";
const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");

function sliceBetween(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return "";
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? text.length : to);
}

export function collectFailures(src = source) {
  const failures = [];
  const resolver = sliceBetween(src, "async function resolveActiveFactor(", "\nfunction withCanonicalFactorIdentity");
  const identityMapper = sliceBetween(src, "function withCanonicalFactorIdentity", "\nexport async function registerFactoringRoutes");
  const requireText = (text, token, message) => { if (!text.includes(token)) failures.push(message); };

  requireText(src, 'import { resolveCanonicalActiveFactor } from "../home/factoring-balance-invoice-linkage.service.js"', "route must import the canonical factor resolver from the canonical service");
  requireText(resolver, "resolveCanonicalActiveFactor(client, companyId)", "local resolver must delegate its client and selected company unchanged");
  requireText(resolver, "if (!identity.ok || !identity.vendorId) return null", "local resolver must fail closed when canonical identity is invalid");
  requireText(resolver, "id: identity.vendorId", "operational factor id must map from canonical vendorId");
  requireText(resolver, "vendor_name: identity.vendorName ?? null", "operational factor name must map from canonical vendorName");
  requireText(resolver, "profile_id: identity.factorProfileId ?? null", "profile identity must map from canonical factorProfileId");
  if (/mdata\.vendors|SELECT[\s\S]*?FROM\s+mdata\./i.test(resolver)) failures.push("local resolver must not query mdata directly");
  requireText(identityMapper, "active_factor_profile_id: activeFactor?.profile_id ?? null", "response mapper must expose the canonical profile id");
  const callCount = (src.match(/resolveActiveFactor\(client, companyId\)/g) ?? []).length;
  if (callCount !== 2) failures.push(`summary/settings routes must each resolve selected-company identity (expected 2 calls, found ${callCount})`);
  requireText(src, "withCanonicalFactorIdentity(summary.row ?? fallback, summary.activeFactor)", "summary response must carry canonical profile identity");
  requireText(src, "const current = withCanonicalFactorIdentity(", "settings response must carry canonical profile identity");
  return failures;
}

function selftest() {
  const baseline = collectFailures();
  if (baseline.length) throw new Error(`clean baseline red: ${baseline.join("; ")}`);
  const mutations = [
    ['import { resolveCanonicalActiveFactor } from "../home/factoring-balance-invoice-linkage.service.js"', 'import { resolveCanonicalActiveFactor } from "../mdata/vendors.js"'],
    ["resolveCanonicalActiveFactor(client, companyId)", "resolveCanonicalActiveFactor(client, crypto.randomUUID())"],
    ["!identity.ok || !identity.vendorId", "!identity.ok"],
    ["id: identity.vendorId", "id: identity.factorProfileId"],
    ["vendor_name: identity.vendorName ?? null", "vendor_name: null"],
    ["profile_id: identity.factorProfileId ?? null", "profile_id: identity.vendorId"],
    ["active_factor_profile_id: activeFactor?.profile_id ?? null", "active_factor_profile_id: activeFactor?.id ?? null"],
    ["const activeFactor = await resolveActiveFactor(client, companyId);", "const activeFactor = null;"],
    ["withCanonicalFactorIdentity(summary.row ?? fallback, summary.activeFactor)", "summary.row ?? fallback"],
    ["const current = withCanonicalFactorIdentity(", "const current = Object.assign("],
  ];
  let rejected = 0;
  for (const [needle, replacement] of mutations) {
    if (!source.includes(needle)) throw new Error(`plant target missing: ${needle}`);
    if (collectFailures(source.replace(needle, replacement)).length) rejected += 1;
  }
  if (rejected !== mutations.length) throw new Error(`rejected ${rejected}/${mutations.length} plants`);
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${mutations.length} canonical delegation plants without editing runtime files`);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const failures = collectFailures();
    if (failures.length) throw new Error(failures.join("; "));
    console.log(`[${LABEL}] PASS: both operational routes return canonical selected-company factor identity`);
  }
} catch (error) {
  console.error(`[${LABEL}] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
