#!/usr/bin/env node
// CC-2 GUARD 2026-08-19: both EntityLink checks below were re-anchored. NamesMasterHub.tsx and
// BrokersListPage.tsx each legitimately added a dead-tombstone-link honesty guard
// (LV-LISTS-NAMES-MASTER-DEAD-TOMBSTONE-LINK / LV-LISTS-BROKERS-DEAD-TOMBSTONE-LINK, both cited
// in-code): the raw `row.display_name`/`row.name` literal is now routed through
// `entityLabel(rawName, id, noun)` into a `label` variable first, so an unresolved/UUID-shaped
// name renders as honest plain text instead of a dead EntityLink. The real EntityLink wiring
// (kind + id) is unchanged; only the label source moved from a literal field access to the
// honesty-wrapped variable. Re-anchored to require `label={label}` fed by a real `entityLabel(...)`
// call over the same row field, instead of the old literal — this is a strictly more honest
// requirement, not a weaker one.
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /LINKABLE_NAME_KINDS[\s\S]*customer:\s*"customer"[\s\S]*vendor:\s*"vendor"[\s\S]*driver:\s*"driver"/, "names kind map"],
  // Allow attrs (data-testid / className / multiline) between EntityLink and kind/id/label.
  [
    "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx",
    /const label = entityLabel\(row\.display_name, row\.entity_id, noun\);[\s\S]{0,120}const canonicalRoute = canonicalEntityRoute\(row, kind\);[\s\S]{0,700}<EntityLink[\s\S]{0,160}kind=\{kind\}[\s\S]{0,80}id=\{row\.entity_id\}[\s\S]{0,80}label=\{label\}/,
    "names canonical labeled drill",
  ],
  [
    "apps/frontend/src/pages/lists/names/BrokersListPage.tsx",
    /const label = entityLabel\(row\.name, row\.id, "Customer"\);[\s\S]{0,500}<EntityLink[\s\S]{0,120}kind="customer"[\s\S]{0,80}id=\{row\.id\}[\s\S]{0,80}label=\{label\}/,
    "brokers canonical labeled drill",
  ],
  ["apps/frontend/src/pages/lists/names/BrokersListPage.tsx", /onRowClick=\{\(row\) => navigate\(`\/customers\/\$\{row\.id\}`\)\}/, "brokers row drill"],
];

const sources = Object.fromEntries([...new Set(checks.map(([file]) => file))].map((file) => [file, fs.readFileSync(file, "utf8")]));

function audit(candidateSources) {
  return checks
    .filter(([file, pattern]) => !pattern.test(candidateSources[file]))
    .map(([file, , label]) => `${label}: ${file}: canonical lists reverse link missing`);
}

if (process.argv.includes("--selftest")) {
  for (const [file, pattern, label] of checks) {
    const match = sources[file].match(pattern)?.[0];
    if (!match) {
      console.error(`verify-wave-b-lists-reverse-link-column SELFTEST FAIL — ${label}: anchor missing`);
      process.exit(1);
    }
    const planted = { ...sources, [file]: sources[file].replace(match, "__PLANTED_REVERSE_LINK_REMOVED__") };
    if (!audit(planted).some((failure) => failure.startsWith(`${label}:`))) {
      console.error(`verify-wave-b-lists-reverse-link-column SELFTEST FAIL — ${label}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`verify-wave-b-lists-reverse-link-column SELFTEST PASS — ${checks.length}/${checks.length} mutations detected`);
  process.exit(0);
}

const failures = audit(sources);

if (failures.length) {
  console.error(`verify-wave-b-lists-reverse-link-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("verify-wave-b-lists-reverse-link-column PASS — Names Master and Brokers drill through canonical entity routes");
