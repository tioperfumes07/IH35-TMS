#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["unit","trailer","connectivity"],"leafRe":"^roster\\.bulk\\.status$","task":"FLEET-BULK-ACTION-LIFECYCLE"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit","trailer","connectivity"],"leafRe":"^roster\\.bulk\\.type$","task":"FLEET-BULK-ACTION-LIFECYCLE"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit","trailer","connectivity"],"leafRe":"^roster\\.bulk\\.inactivate$","task":"FLEET-BULK-ACTION-LIFECYCLE"} */
import fs from "node:fs";

const LABEL = "verify-fleet-bulk-action-lifecycle";
const FILE = "apps/frontend/src/components/FleetTable.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const requirePattern = (pattern, message) => { if (!pattern.test(text)) failures.push(message); };

  requirePattern(/const actionGenerationRef = useRef\(0\)/, "bulk actions need a scope generation");
  requirePattern(/useEffect\(\(\) => \{[\s\S]{0,220}actionGenerationRef\.current \+= 1;[\s\S]{0,220}selection\.clear\(\);[\s\S]{0,220}\}, \[operatingCompanyId\]\)/, "company switch must retire actions and clear selection");
  requirePattern(/mutationFn: \(args: \{ companyId: string; generation: number; unitIds:[\s\S]{0,260}encodeURIComponent\(args\.companyId\)/, "truck bulk update must snapshot company and generation");
  requirePattern(/mutationFn: \(args: \{ companyId: string; generation: number; equipmentIds:[\s\S]{0,320}encodeURIComponent\(args\.companyId\)/, "trailer bulk update must snapshot company and generation");
  requirePattern(/deactivate\?operating_company_id=\$\{encodeURIComponent\(input\.companyId\)\}/, "deactivate must send selected company to the scoped backend route");
  requirePattern(/patchUnit\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/, "truck reactivation must use submitted company");
  requirePattern(/patchTrailer\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/, "trailer reactivation must use submitted company");
  requirePattern(/input\.generation !== actionGenerationRef\.current \|\| input\.companyId !== operatingCompanyId\) return;/, "inactivate/reactivate completion must suppress stale scope feedback");
  requirePattern(/const companyId = operatingCompanyId;[\s\S]{0,100}const generation = actionGenerationRef\.current;/, "bulk apply must snapshot company and generation before writes");
  requirePattern(/generation !== actionGenerationRef\.current \|\| companyId !== operatingCompanyId\) return;/, "bulk apply must stop stale sequential writes and feedback");
  requirePattern(/const invalidateFleetCompany = \(companyId: string\)[\s\S]{0,260}query\.queryKey\.includes\(companyId\)/, "cache invalidation must target only the submitted company across fleet key variants");
  requirePattern(/void invalidateFleetCompany\(input\.companyId\)/, "action completion must invalidate the submitted company cache");
  const staleErrorCallbacks = text.match(/onError: \(error, input\) => \{[\s\S]{0,180}?input\.generation !== actionGenerationRef\.current/g) ?? [];
  if (staleErrorCallbacks.length < 2) failures.push("both rejected inactivate/reactivate actions must suppress stale scope feedback");
  requirePattern(/targets: selectedRows\.map\(\(row\) => \(\{ \.\.\.row \}\)\)/, "destructive actions must snapshot selected rows");
  requirePattern(/failedTargets = input\.targets\.filter[\s\S]{0,260}throw Object\.assign\(new Error/, "partial bulk inactivate must reject with the exact failed targets");
  requirePattern(/selection\.setSelectedIds\(new Set\(partial\.failedTargets\.map\(\(row\) => row\.id\)\)\)/, "failed bulk targets must remain selected for exact retry");
  requirePattern(/onConfirm=\{async \(\) => \{[\s\S]{0,260}await inactivateMutation\.mutateAsync/, "confirmation must await bulk inactivation so failure cannot close as success");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["generation", /const actionGenerationRef = useRef\(0\)/, "const actionGenerationRef = { current: 0 }"],
    ["scope reset", /actionGenerationRef\.current \+= 1;/, "actionGenerationRef.current += 0;"],
    ["truck company", /encodeURIComponent\(args\.companyId\)/, "encodeURIComponent(operatingCompanyId)"],
    ["trailer company", /encodeURIComponent\(args\.companyId\)/g, "encodeURIComponent(operatingCompanyId)"],
    ["deactivate company", /deactivate\?operating_company_id=\$\{encodeURIComponent\(input\.companyId\)\}/, "deactivate"],
    ["truck reactivate", /patchUnit\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/, "patchUnit(row.id, operatingCompanyId, { deactivated_at: null })"],
    ["trailer reactivate", /patchTrailer\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/, "patchTrailer(row.id, operatingCompanyId, { deactivated_at: null })"],
    ["stale callbacks", /input\.generation !== actionGenerationRef\.current \|\| input\.companyId !== operatingCompanyId\) return;/g, "false) return;"],
    ["apply snapshot", /const companyId = operatingCompanyId;/, "const companyId = latestCompanyId;"],
    ["apply stale", /generation !== actionGenerationRef\.current \|\| companyId !== operatingCompanyId\) return;/g, "false) return;"],
    ["cache scope", /query\.queryKey\.includes\(companyId\)/, "true"],
    ["cache submitted company", /void invalidateFleetCompany\(input\.companyId\)/g, "void invalidateFleetCompany(operatingCompanyId)"],
    ["stale errors", /onError: \(error, input\) => \{/g, "onError: (error) => {"],
    ["target snapshot", /targets: selectedRows\.map\(\(row\) => \(\{ \.\.\.row \}\)\)/g, "targets: selectedRows"],
    ["failed target rejection", /throw Object\.assign\(new Error/, "return Object.assign(new Error"],
    ["failed selection", /selection\.setSelectedIds\(new Set\(partial\.failedTargets\.map\(\(row\) => row\.id\)\)\)/, "selection.clear()"],
    ["await confirmation", /await inactivateMutation\.mutateAsync/, "inactivateMutation.mutate"],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`${LABEL} SELFTEST FAIL — ${name}`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fleet bulk actions carry immutable company/targets and suppress stale scope completions`);
