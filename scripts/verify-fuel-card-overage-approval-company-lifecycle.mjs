#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx";
const source = fs.readFileSync(file, "utf8");

function audit(text) {
  const failures = [];
  // LEAD 443.187 — REPOINTED, same rule: 461d5f83ea (ACCT-F2995) added exempt + void mutations with their own stale checks,
  // so a page-wide search let the APPROVAL lose its stale-success / stale-error / exact-refresh guards unnoticed. These
  // checks now read the approval mutation's own block (const approveMut … up to the next useMutation).
  const at = text.indexOf("const approveMut");
  const approve = at < 0 ? "" : text.slice(at, (text.indexOf("useMutation(", at + 30) + 1 || text.length + 1) - 1);
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(text.includes("actionGenerationRef = useRef(0)"), "generation ref missing");
  // LEAD 443.187 — REPOINTED, same rule: the company-change effect also closes the open exempt / void / approve dialogs
  // (setExemptRow / setVoidRow / setConfirmApproveRow(null)), which pushed its closing `}, [companyId])` past the old
  // 50-char window. The increment must still sit inside the ONE effect keyed on [companyId] (no other dependency, no
  // nested effect in between).
  need(/useEffect\(\(\) => \{[\s\S]{0,80}actionGenerationRef\.current \+= 1;(?:(?!useEffect\()[\s\S]){0,240}\}, \[companyId\]\)/.test(text), "company transition does not advance lifecycle");
  need(/mutationFn: \(input: \{ eventId: string; companyId: string; generation: number \}\) =>[\s\S]{0,180}input\.eventId[\s\S]{0,180}operating_company_id: input\.companyId/.test(approve), "approval does not submit immutable event/company/generation");
  need(/onSuccess: \(_result, input\) => \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current/.test(approve), "stale success is not rejected");
  need(approve.includes('["fuel", "card-overage-events", input.companyId]'), "submitted company queue is not refreshed exactly");
  need(/onError: \(err: unknown, input\) => \{[\s\S]{0,120}input\.generation === actionGenerationRef\.current/.test(approve), "stale error is not rejected");
  // bounded to the approval call itself ([^}]*) — a greedy [\s\S]* borrowed the void / exempt calls' generation (461d5f83ea).
  need(/approveMut\.mutateAsync\(\{[^}]*eventId: confirmApproveRow\.id,[^}]*companyId,[^}]*generation: actionGenerationRef\.current/.test(text), "UI does not capture approval context");
  need(text.includes("@matrix-built modules=fuel cols=driver,unit,gl_je,connectivity,reverse_link"), "leaf annotation missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/actionGenerationRef\.current \+= 1/, "void companyId"],
    [/operating_company_id: input\.companyId/, "operating_company_id: companyId"],
    [/if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    [/\["fuel", "card-overage-events", input\.companyId\]/, '["fuel", "card-overage-events"]'],
    [/input\.generation === actionGenerationRef\.current/, "true"],
    [/generation: actionGenerationRef\.current/, "generation: 0"],
  ];
  for (const [index, [pattern, replacement]] of mutations.entries()) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fuel-card-overage-approval-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fuel-card-overage-approval-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-fuel-card-overage-approval-company-lifecycle PASS — approval is isolated to its submitted company/event lifecycle");
