#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet","drivers"],"cols":["trailer","connectivity","reverse_link","picker_law"],"leafRe":"^dispatch\\.modal\\.quick_assign$|^fleet\\.modal\\.quick_assign$|^trailer\\.profile\\.assignment$","task":"THEATER-QUICK-ASSIGN-TRAILER-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-quick-assign-trailer-linkage";
const files = {
  creator: "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  service: "apps/backend/src/dispatch/quick-assign.service.ts",
  inlineService: "apps/backend/src/dispatch/assignments/quicksave.service.ts",
  routes: "apps/backend/src/dispatch/quicksave.routes.ts",
  aggregate: "apps/backend/src/mdata/equipment-aggregate.service.ts",
  profile: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  const draftPath = s.service.match(/export async function completeQuicksaveDraft[\s\S]*?export async function listQuicksaveDrafts/)?.[0] ?? "";
  if (!/<EntityPicker[\s\S]{0,160}kind="trailer"/.test(s.creator) || !/trailer_id: trailerId \|\| undefined/.test(s.creator)) failures.push("canonical trailer picker-to-payload path missing");
  if ((s.service.match(/FROM mdata\.equipment/g) ?? []).length < 2 || (s.service.match(/COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/g) ?? []).length < 2) failures.push("both create paths must validate trailer company scope");
  if ((s.service.match(/deactivated_at IS NULL/g) ?? []).length < 2 || (s.service.match(/E_TRAILER_NOT_FOUND/g) ?? []).length < 2) failures.push("both create paths must reject inactive or missing trailers");
  if (s.service.indexOf("if (!resolvedTrailerId)") < 0 || s.service.indexOf("if (!resolvedTrailerId)") > s.service.indexOf("const update = await client.query")) failures.push("draft trailer validation must precede mutation");
  if (!/previous_trailer_id, new_trailer_id/.test(s.service) || !/input\.trailer_id \?\? null/.test(s.service) || !/resolvedTrailerId \?\? previousTrailerId,\s*userId/.test(s.service)) failures.push("canonical assignment-history trailer FK sink missing");
  if (!/async function resolveCurrentTrailerId/.test(s.service) || !/operating_company_id = \$1::uuid[\s\S]{0,120}load_id = \$2::uuid[\s\S]{0,220}ORDER BY assigned_at DESC, created_at DESC, id DESC/.test(s.service)) failures.push("canonical current-trailer resolver must be explicitly company/load scoped and deterministically ordered");
  if ((s.service.match(/const previousTrailerId = await resolveCurrentTrailerId\(\s*client,\s*input\.operating_company_id,\s*input\.load_id,?\s*\)/g) ?? []).length < 2) failures.push("both quick-assign create paths must preserve the prior canonical trailer");
  if (!/previousTrailerId,\s*input\.trailer_id \?\? null/.test(s.service) || !/previousTrailerId,\s*resolvedTrailerId \?\? previousTrailerId,\s*userId/.test(s.service)) failures.push("both assignment-history writes must stamp previous and new trailer FKs");
  if (!/const assignmentHistoryInsert = await client\.query<\{ id: string \}>\([\s\S]*?INSERT INTO dispatch\.load_assignment_history[\s\S]*?RETURNING id::text[\s\S]*?if \(!assignmentHistoryInsert\.rows\[0\]\?\.id\) throw new Error\("E_ASSIGNMENT_HISTORY_CREATE_FAILED"\)/.test(s.service)) failures.push("combined quick assign must prove canonical assignment-history identity before audit/success");
  if (!/const draftAssignmentHistoryInsert = await client\.query<\{ id: string \}>\([\s\S]*?INSERT INTO dispatch\.load_assignment_history[\s\S]*?RETURNING id::text[\s\S]*?if \(!draftAssignmentHistoryInsert\.rows\[0\]\?\.id\) \{[\s\S]*?throw new Error\("E_ASSIGNMENT_HISTORY_CREATE_FAILED"\)/.test(draftPath)) failures.push("draft completion must prove canonical assignment-history identity before spine/success");
  for (const [label, scopedWriter] of [["quick-assign.service.ts", s.service], ["assignments/quicksave.service.ts", s.inlineService]]) {
    if (/client\.query\(["'`]\s*(?:BEGIN|COMMIT|ROLLBACK)\s*["'`]\)/.test(scopedWriter)) failures.push(`${label} must leave transaction ownership to withCurrentUser`);
  }
  if (!/return withCurrentUser\(userId, async \(client\)/.test(draftPath)) failures.push("draft completion must use the transaction-owning withCurrentUser wrapper");
  if (!/SELECT assigned_unit_id::text[\s\S]{0,220}FOR UPDATE/.test(draftPath)) failures.push("draft completion must lock and capture the prior unit before mutation");
  if (!/previous_unit_id, new_unit_id/.test(draftPath) || !/before\.assigned_unit_id,\s*unitId \?\? before\.assigned_unit_id/.test(draftPath)) failures.push("draft completion must preserve previous/new unit assignment history");
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
    ["prior-resolver", "service", /async function resolveCurrentTrailerId/, "async function removedCurrentTrailerId"],
    ["prior-scope", "service", /operating_company_id = \$1::uuid/, "TRUE"],
    ["prior-call", "service", /const previousTrailerId = await resolveCurrentTrailerId\(\s*client,\s*input\.operating_company_id,\s*input\.load_id,?\s*\)/, "const previousTrailerId = null"],
    ["draft-unit-lock", "service", /SELECT assigned_unit_id::text/, "SELECT NULL::uuid AS assigned_unit_id"],
    ["draft-unit-history", "service", /(export async function completeQuicksaveDraft[\s\S]*?)previous_unit_id, new_unit_id/, "$1new_unit_id"],
    ["draft-unit-values", "service", /before\.assigned_unit_id,\s*unitId \?\? before\.assigned_unit_id/, "null, unitId"],
    ["combined-history-returning", "service", /(const assignmentHistoryInsert = await client\.query<\{ id: string \}>\([\s\S]*?INSERT INTO dispatch\.load_assignment_history[\s\S]*?)RETURNING id::text/, "$1"],
    ["combined-history-check", "service", /if \(!assignmentHistoryInsert\.rows\[0\]\?\.id\) throw new Error\("E_ASSIGNMENT_HISTORY_CREATE_FAILED"\);/, ""],
    ["draft-history-returning", "service", /(const draftAssignmentHistoryInsert = await client\.query<\{ id: string \}>\([\s\S]*?INSERT INTO dispatch\.load_assignment_history[\s\S]*?)RETURNING id::text/, "$1"],
    ["draft-history-check", "service", /if \(!draftAssignmentHistoryInsert\.rows\[0\]\?\.id\) \{[\s\S]*?\}/, ""],
    ["nested-transaction", "service", /try \{/, 'await client.query("COMMIT"); try {'],
    ["inline-nested-transaction", "inlineService", /try \{/, 'await client.query("ROLLBACK"); try {'],
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
