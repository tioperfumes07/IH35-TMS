#!/usr/bin/env node
/**
 * @matrix-built {"modules":["fuel"],"cols":["connectivity"],"leaves":["relay_inbox"],"task":"CLASS-F6533-RELAY-DEPOSIT-REVIEW-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 * Relay company-card review actions must snapshot their company and must not
 * mutate the newly selected company's UI after an old request settles.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/fuel/components/RelayDepositReview.tsx";
const ROUTE_FILE = "apps/backend/src/integrations/relay-payments/relay-deposit-review.routes.ts";

function inspect(source, routes) {
  const errors = [];
  if (!source.includes("useEffect") || !source.includes("lifecycleGenerationRef")) errors.push("missing company lifecycle generation");
  if (!/useEffect\(\(\) => \{[\s\S]*addCardMutation\.reset\(\)[\s\S]*deactivateMutation\.reset\(\)[\s\S]*setNewCard\(""\)[\s\S]*\}, \[companyId\]\)/.test(source)) {
    errors.push("company transition does not reset both mutations and card draft");
  }
  if (!/mutationFn: \(input: \{ companyId: string; card: string; label\?: string; generation: number \}\)/.test(source)) {
    errors.push("add-card request does not snapshot company");
  }
  if (!/mutationFn: \(input: \{ companyId: string; card: string; generation: number \}\)/.test(source)) {
    errors.push("deactivate request does not snapshot company");
  }
  const scopedWriters = source.match(/putRelayCompanyCard\(input\.companyId/g)?.length ?? 0;
  if (scopedWriters !== 2) errors.push("both card writers must use their submitting company snapshot");
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards < 4) errors.push("add/deactivate success and error are not all stale-context guarded");
  if (!source.includes('queryKey: ["relay", "deposits", input.companyId]') || !source.includes('queryKey: ["relay", "company-cards", input.companyId]')) {
    errors.push("mutation refresh is not scoped to submitting company");
  }
  const submitSnapshots = source.match(/companyId,[\s\S]{0,160}generation: lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (submitSnapshots < 3) errors.push("all three card actions do not carry company/generation snapshots");
  if (!routes.includes('import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";')) {
    errors.push("Relay review routes do not import the canonical company-membership boundary");
  }
  // Heavy CI peel — re-pointed, same rule, stricter: 8befa255e2 (#26709, LEAD 443.133 B) added a fourth route
  // (POST /deposits/classify-and-post) with a refusal-audit bypass, so "exactly three" no longer describes the file. The rule
  // is now per route: EVERY bypass boundary (return or await withLuciaBypass) must be preceded, inside the same route
  // handler, by a membership proof for the requested company.
  const routeStarts = [...routes.matchAll(/app\.(get|post|put|patch|delete)\(/g)].map((m) => m.index);
  const bypassAt = [...routes.matchAll(/(?:return|await) withLuciaBypass\(/g)].map((m) => m.index);
  if (bypassAt.length < 4) errors.push("expected every Relay review route (4) to enter the bypass boundary");
  for (const b of bypassAt) {
    const start = Math.max(...routeStarts.filter((r) => r < b), -1);
    const handler = routes.slice(start < 0 ? 0 : start, b);
    if (!/await assertCompanyMembership\(user!?\.uuid, opco\);/.test(handler)) {
      errors.push(`a bypass boundary at offset ${b} is entered without proving requested-company membership first`);
    }
  }
  if (!/ON CONFLICT[\s\S]*RETURNING id::text, label, source_hint, is_active/.test(routes)) {
    errors.push("company-card upsert does not query back its canonical persisted identity/state");
  }
  if (!routes.includes('if (!persistedCard) throw new Error("relay_company_card_write_failed")')) {
    errors.push("company-card upsert can report success without a persisted identity");
  }
  if (!routes.includes('"integrations.relay_company_card.updated"') || !routes.includes('"FUEL-RELAY-CARD-REVIEW"')) {
    errors.push("company-card lifecycle does not append its canonical audit event");
  }
  const auditIndex = routes.indexOf('"integrations.relay_company_card.updated"');
  const responseIndex = routes.indexOf("return reply.code(200).send({", routes.indexOf("app.put"));
  if (auditIndex < 0 || responseIndex < 0 || auditIndex > responseIndex) errors.push("card audit must complete before HTTP success");
  if (!routes.includes("label = COALESCE(EXCLUDED.label, existing.label)")) {
    errors.push("is_active-only card lifecycle can erase the existing human label");
  }
  if (!routes.includes("source_hint = COALESCE(EXCLUDED.source_hint, existing.source_hint)")) {
    errors.push("is_active-only card lifecycle can erase the existing funding source hint");
  }
  // 8befa255e2 (443.133 B) added the owner card-map classes "party" and "intercompany" — the allowlist is the shipped five.
  if (!routes.includes('const RELAY_DEPOSIT_CLASSIFICATIONS = ["company", "party", "intercompany", "unclassified", "canceled"] as const;')) {
    errors.push("Relay deposit filter has no canonical classification allowlist");
  }
  if (!/requestedClassification[\s\S]*!RELAY_DEPOSIT_CLASSIFICATIONS\.includes[\s\S]*reply\.code\(400\)/.test(routes)) {
    errors.push("invalid Relay deposit classification silently fails open to the full queue");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const routes = fs.readFileSync(ROUTE_FILE, "utf8");
  const mutations = [
    [source.replace("addCardMutation.reset();", "// planted: add reset removed"), routes],
    [source.replace("putRelayCompanyCard(input.companyId", "putRelayCompanyCard(companyId"), routes],
    [source.replaceAll("input.generation !== lifecycleGenerationRef.current", "false"), routes],
    [source, routes.replace("await assertCompanyMembership(user.uuid, opco);", "// planted: membership removed")],
    [source, routes.replace("await assertCompanyMembership(user!.uuid, opco);\n    if (String(user?.role", "if (String(user?.role")],
    [source, routes.replace("RETURNING id::text, label, source_hint, is_active", "RETURNING label, source_hint, is_active")],
    [source, routes.replace('"integrations.relay_company_card.updated"', '"planted.audit.removed"')],
    [source, routes.replace("label = COALESCE(EXCLUDED.label, existing.label)", "label = EXCLUDED.label")],
    [source, routes.replace("source_hint = COALESCE(EXCLUDED.source_hint, existing.source_hint)", "source_hint = EXCLUDED.source_hint")],
    [source, routes.replace("!RELAY_DEPOSIT_CLASSIFICATIONS.includes", "RELAY_DEPOSIT_CLASSIFICATIONS.includes")],
  ];
  const missed = mutations.filter(([candidateSource, candidateRoutes]) => inspect(candidateSource, candidateRoutes).length === 0);
  if (missed.length) {
    console.error(`verify-relay-deposit-review-company-lifecycle SELFTEST FAIL — ${missed.length}/${mutations.length} mutation(s) survived`);
    process.exit(1);
  }
  console.log(`verify-relay-deposit-review-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"), fs.readFileSync(ROUTE_FILE, "utf8"));
if (errors.length) {
  console.error("verify-relay-deposit-review-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-relay-deposit-review-company-lifecycle PASS — UI lifecycle and all Relay review bypasses are company-isolated");
