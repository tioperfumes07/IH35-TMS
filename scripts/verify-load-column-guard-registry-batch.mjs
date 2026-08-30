#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";
const LABEL = "verify-load-column-guard-registry-batch";
const REQUIRED = [
  "verify-border-crossing-load-linkage.mjs", "verify-dispatch-required-load-honest.mjs",
  "verify-book-load-no-crew-not-assigned.mjs",
  "verify-dispatch-trailer-board-and-book-load.mjs", "verify-internal-fine-load-reverse.mjs",
  "verify-intransit-issue-load-linkage.mjs", "verify-load-drill-route-vertical-sweep.mjs",
  "verify-load-inline-surface-linkage.mjs", "verify-roundtrips-quality-load-entitylink.mjs",
];
function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  return out;
}
if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: ["unrelated.mjs"] };
  if (!failures({ ...baseline, fullyWired: REQUIRED.slice(1) }).length) throw new Error("required-member mutation escaped");
  if (failures({ ...baseline, unaccounted: [...baseline.unaccounted, "another-unrelated.mjs"] }).length) throw new Error("unrelated census growth failed focused registry");
  console.log(`${LABEL} SELFTEST PASS — owned removal rejected; unrelated census growth accepted`); process.exit(0);
}
const problems = failures(classifyGuards());
if (problems.length) { console.error(`${LABEL} FAIL\n${problems.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — ${REQUIRED.length} exact load-column guards execute in CI`);
