#!/usr/bin/env node
import fs from "node:fs";

const files = {
  wizard: "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  api: "apps/frontend/src/api/mdata.ts",
  filter: "apps/backend/src/mdata/fleet-type-filter.ts",
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

// INS-F7494 (#18140) superseded INS-F6906's wizard-local union fleet read: insurance.policy_unit persists
// mdata.assets identities and resolveMdataAssetId only resolves assets or units, so a trailer id from
// mdata.equipment cannot be saved. The wizard now picks covered units through the company-scoped canonical
// EntityPicker kind="unit" (server-side search, pages the whole scoped fleet) and submits only those ids.
// verify-entity-picker-trailer-kind-sweep enforces the other half (no `include: "trailers"` on this surface).
function failures(s) {
  const out = [];
  if (!/<EntityPicker\s[^>]*kind="unit"[^>]*operatingCompanyId=\{operatingCompanyId\}/s.test(s.wizard)) out.push("wizard must pick covered units through the company-scoped canonical EntityPicker kind=\"unit\"");
  if (s.wizard.includes('include: "trailers"') || /kind="trailer"/.test(s.wizard)) out.push("wizard must not widen the picker with mdata.equipment trailers (insurance.policy_unit persists unit/asset ids only)");
  if (!s.wizard.includes("unit_ids: selectedUnits.map((unit) => unit.value)")) out.push("wizard must submit only the picked canonical unit ids");
  if (/"TRK"|"TRANSP"/.test(s.wizard.match(/const UNIT_TYPE_CHIPS[^;]+;/s)?.[0] ?? "")) out.push("USMCA creator must not expose cross-entity chips");
  if (!s.api.includes('if (params.type) query.set("type", params.type)')) out.push("frontend API must forward the type filter");
  if (!s.filter.includes('"Trailer"') || !s.filter.includes('if (type === "Trailer")')) out.push("backend must support the all-trailers filter");
  return out;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, wizard: source.wizard.replace('kind="unit"', 'kind="trailer"') },
    { ...source, wizard: source.wizard.replace("<EntityPicker\n              kind=\"unit\"", "<EntityPicker\n              kind=\"unit\" data-x=\"1\"\n              include: \"trailers\"") },
    { ...source, wizard: source.wizard.replace('operatingCompanyId={operatingCompanyId}\n              value={null}', 'value={null}') },
    { ...source, wizard: source.wizard.replace("unit_ids: selectedUnits.map((unit) => unit.value)", "unit_ids: []") },
    { ...source, api: source.api.replace('if (params.type) query.set("type", params.type)', "") },
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
console.log("PASS: insurance policy wizard picks covered units through the canonical company-scoped unit EntityPicker (no trailer leak)");
