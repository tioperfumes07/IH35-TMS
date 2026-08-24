#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet","drivers"],"cols":["trailer","connectivity","reverse_link","picker_law"],"leafRe":"^dispatch\\.modal\\.quick_assign$|^fleet\\.modal\\.quick_assign$|^trailer\\.profile\\.assignment$","task":"THEATER-QUICK-ASSIGN-TRAILER-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-quick-assign-trailer-linkage";
const files = {
  creator: "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  service: "apps/backend/src/dispatch/quick-assign.service.ts",
  routes: "apps/backend/src/dispatch/quicksave.routes.ts",
  aggregate: "apps/backend/src/mdata/equipment-aggregate.service.ts",
  profile: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/<EntityPicker[\s\S]{0,160}kind="trailer"/.test(s.creator) || !/trailer_id: trailerId \|\| undefined/.test(s.creator)) failures.push("canonical trailer picker-to-payload path missing");
  if ((s.service.match(/FROM mdata\.equipment/g) ?? []).length < 2 || (s.service.match(/COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/g) ?? []).length < 2) failures.push("both create paths must validate trailer company scope");
  if ((s.service.match(/deactivated_at IS NULL/g) ?? []).length < 2 || (s.service.match(/E_TRAILER_NOT_FOUND/g) ?? []).length < 2) failures.push("both create paths must reject inactive or missing trailers");
  if (s.service.indexOf("if (!resolvedTrailerId)") < 0 || s.service.indexOf("if (!resolvedTrailerId)") > s.service.indexOf("const update = await client.query")) failures.push("draft trailer validation must precede mutation");
  if (!/previous_trailer_id, new_trailer_id/.test(s.service) || !/input\.trailer_id \?\? null/.test(s.service) || !/resolvedTrailerId, userId/.test(s.service)) failures.push("canonical assignment-history trailer FK sink missing");
  if (!/code === "E_TRAILER_NOT_FOUND"[\s\S]{0,120}status: 404/.test(s.routes)) failures.push("trailer rejection route mapping missing");
  if (!/lah\.new_trailer_id = \$1::uuid/.test(s.aggregate) || !/lah\.operating_company_id = \$2::uuid/.test(s.aggregate) || !/l\.operating_company_id = lah\.operating_company_id/.test(s.aggregate)) failures.push("exact entity-scoped trailer reverse query missing");
  if (!/FROM mdata\.units WHERE id = \$1::uuid AND \(owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid\)/.test(s.aggregate)) failures.push("attached-unit reverse label must admit the unit owner or current lessee");
  if (!/aggregate\.loads \?\? \[\]/.test(s.profile) || !/<EntityLinkOrTombstone[\s\S]{0,160}kind="load"[\s\S]{0,180}noun="Load"/.test(s.profile) || !/No linked loads\./.test(s.profile)) failures.push("trailer profile reverse load drill/tombstone or honest empty state missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind="trailer"/, 'kind="unit"'],
    ["payload", "creator", /trailer_id: trailerId \|\| undefined/, "trailer_id: undefined"],
    ["scope", "service", /COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/g, "TRUE"],
    ["active", "service", /deactivated_at IS NULL/g, "TRUE"],
    ["reject", "service", /E_TRAILER_NOT_FOUND/g, "E_TRAILER_UNKNOWN"],
    ["order", "service", /if \(!resolvedTrailerId\) throw new Error\("E_TRAILER_NOT_FOUND"\);/, ""],
    ["sink", "service", /input\.trailer_id \?\? null/, "null"],
    ["route", "routes", /code === "E_TRAILER_NOT_FOUND"/, 'code === "E_UNKNOWN"'],
    ["reverse", "aggregate", /lah\.new_trailer_id = \$1::uuid/, "TRUE"],
    ["attached-unit-scope", "aggregate", /owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid/, "owner_company_id = $2::uuid"],
    ["drill", "profile", /<EntityLinkOrTombstone/, '<EntityLink'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — trailer picker→scoped pre-write validation→history FK→exact profile reverse`);
