#!/usr/bin/env node
/** Ratchet: Factoring Home reads, resolves, displays, and updates one canonical factoring.factor row. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-home-canonical-factor-profile";
const paths = {
  page: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
  api: "apps/frontend/src/api/factoring.ts",
  profile: "apps/frontend/src/lib/factorProfile.ts",
  panel: "apps/frontend/src/pages/factoring/FactoringProfilePanel.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

export function collectFailures(src = source) {
  const failures = [];
  const requireText = (key, token, message) => { if (!src[key].includes(token)) failures.push(message); };
  const forbid = (key, pattern, message) => { if (pattern.test(src[key])) failures.push(message); };

  forbid("page", /activeFactorVendor|parseVendorNotes|serializeVendorNotes|updateVendor\s*\(/, "Factoring profile must never use the mdata vendor-notes dual path");
  requireText("page", 'queryKey: ["factoring", "factors", companyId]', "factor reader cache must be selected-company scoped");
  requireText("page", "queryFn: () => listFactors(companyId).then((res) => res.factors)", "profile must read canonical factors for the selected company");
  requireText("page", "resolveActiveFactorFromSummary(summary, factorsQuery.data ?? [])", "profile must resolve the canonical summary identity against canonical factor rows");
  requireText("page", "<FactoringProfilePanel\n            factor={activeFactor}", "mounted profile panel must receive the resolved factor row");
  requireText("page", "setProfileEditForm(factorToProfileForm(activeFactor))", "edit form must hydrate from that same resolved row");
  requireText("page", "await updateFactor(activeFactor.id, companyId, {", "save must patch that same factor id inside the selected company");
  requireText("page", 'queryKey: ["factoring", "factors", companyId]', "save/read invalidation must retain selected-company identity");
  requireText("page", "No factor configured. Activate a factor to manage its profile.", "honest no-factor state must remain visible");

  requireText("api", "operating_company_id: companyId, active_only: options.active_only", "factor list API must send selected company scope");
  requireText("api", "`/api/v1/factoring/factors/${encodeURIComponent(factorId)}`", "factor update API must address the canonical factor id");
  requireText("api", "operating_company_id: companyId,\n      ...body", "factor update body must carry selected company scope");
  requireText("profile", "const profileId = summary?.active_factor_profile_id?.trim()", "resolver must prefer canonical active_factor_profile_id");
  requireText("profile", "factors.find((factor) => factor.id === profileId)", "resolver must match canonical profile id to factor.id");
  requireText("panel", "parseRemittanceDetails(factor.remittance_details)", "panel must render canonical factor remittance details");
  requireText("panel", "{factor.name} · primary factoring company on file", "panel must display the resolved factor name");
  requireText("panel", "rateToPctString(factor.advance_rate)", "panel must display the resolved factor advance rate");
  return failures;
}

function selftest() {
  const baseline = collectFailures();
  if (baseline.length) throw new Error(`clean baseline red: ${baseline.join("; ")}`);
  const mutations = [
    ["page", 'queryKey: ["factoring", "factors", companyId]', 'queryKey: ["factoring", "factors"]'],
    ["page", "listFactors(companyId)", "listFactors(\"wrong-company\")"],
    ["page", "resolveActiveFactorFromSummary(summary, factorsQuery.data ?? [])", "resolveActiveFactorFromSummary(null, factorsQuery.data ?? [])"],
    ["page", "factor={activeFactor}", "factor={factorsQuery.data?.[0]}"],
    ["page", "factorToProfileForm(activeFactor)", "factorToProfileForm(factorsQuery.data![0])"],
    ["page", "updateFactor(activeFactor.id, companyId", "updateFactor(summary!.active_factor_id!, companyId"],
    ["api", "operating_company_id: companyId, active_only: options.active_only", "active_only: options.active_only"],
    ["api", "encodeURIComponent(factorId)", "encodeURIComponent(companyId)"],
    ["api", "operating_company_id: companyId,\n      ...body", "...body"],
    ["profile", "summary?.active_factor_profile_id?.trim()", "summary?.active_factor_name?.trim()"],
    ["profile", "factor.id === profileId", "factor.name === profileId"],
    ["panel", "factor.remittance_details", "null"],
    ["panel", "{factor.name} · primary factoring company on file", "Unknown factor"],
    ["panel", "rateToPctString(factor.advance_rate)", "rateToPctString(0)"],
  ];
  let rejected = 0;
  for (const [key, needle, replacement] of mutations) {
    if (!source[key].includes(needle)) throw new Error(`plant target missing in ${key}: ${needle}`);
    const planted = { ...source, [key]: source[key].split(needle).join(replacement) };
    if (collectFailures(planted).length) rejected += 1;
  }
  if (rejected !== mutations.length) throw new Error(`rejected ${rejected}/${mutations.length} plants`);
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${mutations.length} canonical factor identity plants`);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const failures = collectFailures();
    if (failures.length) throw new Error(failures.join("; "));
    console.log(`[${LABEL}] PASS: one selected-company factoring.factor row powers read, profile, edit, and save`);
  }
} catch (error) {
  console.error(`[${LABEL}] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
