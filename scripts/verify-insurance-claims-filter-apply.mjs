#!/usr/bin/env node
/** Ratchet: Insurance Claims linkage filters stage changes and commit only through Apply. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";

function verify(source) {
  const failures = [];
  if (!source.includes("useStagedListFilters")) failures.push("claims filters do not use staged state");
  if (!source.includes("<CollapsedListFilters")) failures.push("claims filters lack governed Apply/Cancel/Reset chrome");
  if (!source.includes("onApply={stagedFilters.apply}")) failures.push("Apply is not wired to staged state");
  if (!source.includes("onCancel={stagedFilters.cancel}")) failures.push("Cancel is not wired");
  if (!source.includes("onReset={stagedFilters.reset}")) failures.push("Reset is not wired");
  for (const kind of ["driver", "unit", "load", "trailer"]) {
    if (!source.includes(`value={stagedFilters.draft.${kind} || null}`)) failures.push(`${kind} picker does not read draft state`);
    if (!source.includes(`stagedFilters.setDraft((draft) => ({ ...draft, ${kind}: next ?? "" }))`)) failures.push(`${kind} picker bypasses staged state`);
  }
  if (!source.includes("onApply: applyEntityFilters")) failures.push("staged Apply does not commit canonical URL/query state");
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
const failures = verify(source);
if (failures.length) {
  console.error(`FAIL verify-insurance-claims-filter-apply:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("<CollapsedListFilters", "<div"),
    source.replace("onApply={stagedFilters.apply}", "onApply={() => undefined}"),
    source.replace("onCancel={stagedFilters.cancel}", "onCancel={() => undefined}"),
    source.replace('value={stagedFilters.draft.driver || null}', "value={driverFilter || null}"),
    source.replace('stagedFilters.setDraft((draft) => ({ ...draft, trailer: next ?? "" }))', "applyEntityFilters({ ...stagedFilters.draft, trailer: next ?? \"\" })"),
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) {
    console.error(`FAIL verify-insurance-claims-filter-apply selftest: caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`PASS verify-insurance-claims-filter-apply selftest: ${caught}/${mutations.length} planted defects caught`);
} else {
  console.log("PASS verify-insurance-claims-filter-apply");
}
