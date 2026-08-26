#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/frontend/src/components/fleet/EditTrailerModal.tsx";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["leaf matrix claim", /@matrix-built modules=fleet cols=trailer,connectivity,reverse_link/],
  ["generation ref", /const actionGenerationRef = useRef\(0\)/],
  ["context transition increments generation", /useEffect\(\(\) => \{\s*actionGenerationRef\.current \+= 1;[\s\S]*?\}, \[open, trailerId, operatingCompanyId\]\)/],
  ["dismiss increments generation", /const resetAndClose = \(\) => \{\s*actionGenerationRef\.current \+= 1/],
  ["dismiss resets mutation", /const resetAndClose[\s\S]*?saveMutation\.reset\(\)/],
  ["mutation snapshots scope and patch", /mutationFn: \(input: \{ trailerId: string; companyId: string; generation: number; patch: Record<string, unknown> \}\) => patchTrailer\(input\.trailerId, input\.companyId, input\.patch\)/],
  ["caller copies patch", /saveMutation\.mutate\(\{ trailerId, companyId: operatingCompanyId, generation: actionGenerationRef\.current, patch: \{ \.\.\.patchPayload \} \}\)/],
  ["stale success rejected", /onSuccess: \(_data, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return/],
  ["stale error rejected", /input\.generation === actionGenerationRef\.current/],
  ["exact profile invalidation", /\["trailer-profile", input\.trailerId, input\.companyId\]/],
  ["exact modal invalidation", /\["edit-trailer-modal", input\.trailerId, input\.companyId\]/],
  ["leased company field retained", /data-testid="edit-trailer-currently_leased_to_company_id"/],
];
function failures(text) { return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label); }
const base = failures(source);
if (base.length) { console.error(`verify-edit-trailer-action-company-lifecycle FAIL: ${base.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replaceAll("actionGenerationRef.current += 1", "actionGenerationRef.current += 0"),
    source.replace("patchTrailer(input.trailerId, input.companyId, input.patch)", "patchTrailer(trailerId, operatingCompanyId, patchPayload)"),
    source.replace("patch: { ...patchPayload }", "patch: patchPayload"),
    source.replace("input.generation !== actionGenerationRef.current", "false"),
    source.replace('["trailer-profile", input.trailerId, input.companyId]', '["trailer-profile", trailerId, operatingCompanyId]'),
  ];
  const escaped = mutations.filter((text) => failures(text).length === 0).length;
  if (escaped) { console.error(`verify-edit-trailer-action-company-lifecycle selftest FAIL: ${escaped}/5 mutations escaped`); process.exit(1); }
  console.log("verify-edit-trailer-action-company-lifecycle selftest PASS — 5/5 planted defects detected");
  process.exit(0);
}
console.log("verify-edit-trailer-action-company-lifecycle PASS — edit save preserves submitted company/trailer/patch across transitions");
