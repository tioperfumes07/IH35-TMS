#!/usr/bin/env node
/**
 * @matrix-built {"modules":["fuel"],"cols":["connectivity"],"leaves":["relay_inbox"],"task":"CLASS-F6533-RELAY-DEPOSIT-REVIEW-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 * Relay company-card review actions must snapshot their company and must not
 * mutate the newly selected company's UI after an old request settles.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/fuel/components/RelayDepositReview.tsx";

function inspect(source) {
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
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("addCardMutation.reset();", "// planted: add reset removed"),
    source.replace("putRelayCompanyCard(input.companyId", "putRelayCompanyCard(companyId"),
    source.replaceAll("input.generation !== lifecycleGenerationRef.current", "false"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-relay-deposit-review-company-lifecycle SELFTEST FAIL — ${missed.length}/3 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-relay-deposit-review-company-lifecycle selftest PASS — 3/3 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-relay-deposit-review-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-relay-deposit-review-company-lifecycle PASS — add/deactivate drafts and callbacks are company-isolated");
