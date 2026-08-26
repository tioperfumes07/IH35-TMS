#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["connectivity","qbo_chrome"],"leaves":["safety.tab.csa_scores"],"task":"CLASS-F6540-CSA-PULL-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 * CSA public-source pulls and their visible failure state must remain owned by
 * the exact selected operating company that initiated them.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/CSAScore.tsx";

function inspect(source) {
  const errors = [];
  if (!source.includes("lifecycleGenerationRef") || !/useEffect\(\(\) => \{[\s\S]*lifecycleGenerationRef\.current \+= 1;[\s\S]*pullMutation\.reset\(\);[\s\S]*\}, \[companyId\]\)/.test(source)) {
    errors.push("company transition does not reset and advance CSA pull lifecycle");
  }
  if (!/mutationFn: \(input: \{ companyId: string; generation: number \}\) => pullNow\(input\.companyId\)/.test(source)) {
    errors.push("CSA pull does not snapshot the submitting company");
  }
  if (!source.includes("input.generation !== lifecycleGenerationRef.current")) errors.push("stale pull success can refresh the new company");
  if (!source.includes('["compliance-csa", "current", input.companyId]') || !source.includes('["compliance-csa", "trends", input.companyId]')) {
    errors.push("CSA cache invalidation is not pinned to the submitting company");
  }
  if (!/pullFailedForCurrentCompany = pullMutation\.isError[\s\S]*pullMutation\.variables\?\.companyId === companyId[\s\S]*pullMutation\.variables\.generation === lifecycleGenerationRef\.current/.test(source)) {
    errors.push("visible pull failure is not restricted to the current company lifecycle");
  }
  if (!/pullMutation\.mutate\(\{ companyId, generation: lifecycleGenerationRef\.current \}\)/.test(source)) {
    errors.push("pull action does not submit an immutable company/generation snapshot");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("pullMutation.reset();", "// planted: mutation survives company change"),
    source.replace("pullNow(input.companyId)", "pullNow(companyId)"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("pullMutation.variables?.companyId === companyId", "true"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-csa-pull-company-lifecycle SELFTEST FAIL — ${missed.length}/4 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-csa-pull-company-lifecycle selftest PASS — 4/4 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-csa-pull-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-csa-pull-company-lifecycle PASS — CSA pull state is company-local");
