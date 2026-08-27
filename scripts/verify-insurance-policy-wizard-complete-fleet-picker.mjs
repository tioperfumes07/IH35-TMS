#!/usr/bin/env node
import fs from "node:fs";

const files = {
  wizard: "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  api: "apps/frontend/src/api/mdata.ts",
  filter: "apps/backend/src/mdata/fleet-type-filter.ts",
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(s) {
  const out = [];
  if (!s.wizard.includes('include: "trailers"')) out.push("wizard must read the unified truck+trailer fleet");
  if (!s.wizard.includes('type: activeChip === "All" ? undefined : activeChip')) out.push("type chips must filter server-side");
  if (!s.wizard.includes('unitSearchQuery, activeChip]')) out.push("type changes must own the query key");
  if (/"TRK"|"TRANSP"/.test(s.wizard.match(/const UNIT_TYPE_CHIPS[^;]+;/s)?.[0] ?? "")) out.push("USMCA creator must not expose cross-entity chips");
  if (!s.api.includes('if (params.type) query.set("type", params.type)')) out.push("frontend API must forward the type filter");
  if (!s.filter.includes('"Trailer"') || !s.filter.includes('if (type === "Trailer")')) out.push("backend must support the all-trailers filter");
  return out;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, wizard: source.wizard.replace('include: "trailers",', "") },
    { ...source, wizard: source.wizard.replace('type: activeChip === "All" ? undefined : activeChip,', "") },
    { ...source, wizard: source.wizard.replace('unitSearchQuery, activeChip]', 'unitSearchQuery]') },
    { ...source, filter: source.filter.replace('if (type === "Trailer")', 'if (type === "Trailer_DISABLED")') },
  ];
  const missed = mutations.filter((mutation) => failures(mutation).length === 0).length;
  if (missed) {
    console.error(`FAIL: selftest missed ${missed}/${mutations.length} planted regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length}/${mutations.length} fleet-picker regressions`);
  process.exit(0);
}

const found = failures(source);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: insurance policy wizard searches the complete scoped truck+trailer fleet by server type");
