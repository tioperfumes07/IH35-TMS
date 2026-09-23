#!/usr/bin/env node
// @matrix-built {"modules":["dispatch"],"cols":["trailer"],"leaves":["planning.reserve"],"task":"DISP-F6281-MDATA-LOAD-CREATE-TRAILER-EQUIPMENT-NOT-NULL"}
import fs from "node:fs";

const LABEL = "verify-mdata-load-create-trailer-equipment-default";
const FILES = {
  book: "apps/backend/src/dispatch/book-load.service.ts",
  loads: "apps/backend/src/mdata/loads.routes.ts",
  required: "docs/specs/scoreboard/modules/dispatch.required.json",
  guard: "scripts/verify-mdata-load-create-trailer-equipment-default.mjs",
};
const read = (file) => fs.readFileSync(file, "utf8");

function verify(source) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  const createStart = source.loads.indexOf('app.post("/api/v1/mdata/loads"');
  const createEnd = source.loads.indexOf('app.get("/api/v1/mdata/loads"', createStart);
  const create = createStart >= 0 && createEnd > createStart ? source.loads.slice(createStart, createEnd) : "";
  const required = JSON.parse(source.required);
  const reserve = required.leaves?.find((leaf) => leaf.id === "planning.reserve");
  const header = source.guard.split("\n").slice(0, 4).join("\n");

  need(/export async function resolveLoadTrailerEquipmentIdForInsert\(/.test(source.book), "canonical trailer-equipment resolver must be shared");
  need(/load_trailer_equipment_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(source.loads), "mdata create schema must accept an optional canonical equipment FK");

  // 2026-09-23 (E20/loads.routes.ts rewire, Lead ruling "fully built onto the shared create
  // path"): this route no longer resolves trailer equipment locally or runs its own INSERT --
  // it delegates to createLoadWithFullSideEffects, which calls
  // resolveLoadTrailerEquipmentIdForInsert INTERNALLY (verified in book-load.service.ts below)
  // and persists/returns the result via its own INSERT ... RETURNING *. Accept EITHER the old
  // local-resolve-then-INSERT shape (so a revert can't silently drop this) OR delegation with
  // load_trailer_equipment_id passed through in the BookLoadInput object literal.
  const delegatesToSharedPath = /createLoadWithFullSideEffects\(/.test(create);
  const passesTrailerEquipmentThrough = /load_trailer_equipment_id:\s*b\.load_trailer_equipment_id/.test(create);
  const hasLocalResolve = /const loadTrailerEquipmentId = await resolveLoadTrailerEquipmentIdForInsert\(/.test(create);

  if (!delegatesToSharedPath && !hasLocalResolve) {
    failures.push("mdata creator must either resolve trailer equipment locally before its own INSERT, or delegate to createLoadWithFullSideEffects");
  } else if (delegatesToSharedPath) {
    if (!passesTrailerEquipmentThrough) {
      failures.push(
        "mdata creator delegates to createLoadWithFullSideEffects but never passes " +
          '"load_trailer_equipment_id: b.load_trailer_equipment_id" through -- the shared ' +
          "resolver never sees the caller's explicit choice and always falls back to the DRY_VAN default"
      );
    }
    // The shared path's own INSERT is the real persistence point once delegated -- confirm IT
    // still writes and returns the column, same invariant the old local checks enforced directly.
    need(/load_trailer_equipment_id,/.test(source.book), "shared create path's INSERT must persist load_trailer_equipment_id");
    need(/RETURNING \*/.test(source.book) || /RETURNING[\s\S]{0,2000}load_trailer_equipment_id/.test(source.book), "shared create path's INSERT must return load_trailer_equipment_id (RETURNING * or an explicit column)");
  } else {
    need(/const loadTrailerEquipmentId = await resolveLoadTrailerEquipmentIdForInsert\([\s\S]{0,180}b\.operating_company_id,[\s\S]{0,100}b\.load_trailer_equipment_id/.test(create), "mdata creator must resolve explicit-or-DRY_VAN equipment before INSERT");
    need(/is_sample_data, load_trailer_equipment_id[\s\S]{0,180}\$13,\$14/.test(create), "mdata INSERT must persist load_trailer_equipment_id in lockstep");
    need(/b\.is_sample_data \?\? false,[\s\S]{0,80}loadTrailerEquipmentId/.test(create), "mdata INSERT values must carry the resolved equipment FK");
    need(/RETURNING[\s\S]{0,500}load_trailer_equipment_id/.test(create), "mdata create response must reload the persisted equipment FK");
  }
  need(reserve?.required?.includes("trailer"), "dispatch planning.reserve must require trailer wiring");
  need(header.includes('"cols":["trailer"],"leaves":["planning.reserve"]'), "guard must own the exact planning.reserve trailer cell");
  return failures;
}

const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
const failures = verify(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  // 2026-09-23 (E20/loads.routes.ts rewire): mdata/loads.routes.ts no longer resolves trailer
  // equipment locally or runs its own INSERT -- it delegates to createLoadWithFullSideEffects.
  // Mutations updated to plant regressions on the CURRENT (delegated) shape; the pre-rewire
  // literal-INSERT branch in verify() above is still reachable code (a revert would hit it) but
  // has no live fixture to mutate against any more.
  const mutations = [
    ["book", /export async function resolveLoadTrailerEquipmentIdForInsert/, "async function resolveLoadTrailerEquipmentIdForInsert"],
    ["loads", /load_trailer_equipment_id: z\.string\(\)\.uuid\(\)\.optional\(\),/, ""],
    ["loads", /load_trailer_equipment_id:\s*b\.load_trailer_equipment_id,/, ""],
    ["loads", /createLoadWithFullSideEffects\(/g, "someOtherFunctionEntirely("],
    ["book", /load_trailer_equipment_id, commodity, cargo_weight_lbs,/, "commodity, cargo_weight_lbs,"],
    ["guard", /"cols":\["trailer"\],"leaves":\["planning\.reserve"\]/, '"cols":["load"],"leaves":["planning.reserve"]'],
  ];
  for (const [key, pattern, replacement] of mutations) {
    const mutated = source[key].replace(pattern, replacement);
    if (mutated === source[key]) throw new Error(`${LABEL} SELFTEST fixture drift: ${key} ${pattern}`);
    if (verify({ ...source, [key]: mutated }).length === 0) throw new Error(`${LABEL} SELFTEST mutation escaped: ${key} ${pattern}`);
  }
  const required = JSON.parse(source.required);
  required.leaves.find((leaf) => leaf.id === "planning.reserve").required = required.leaves
    .find((leaf) => leaf.id === "planning.reserve").required.filter((column) => column !== "trailer");
  if (verify({ ...source, required: JSON.stringify(required) }).length === 0) {
    throw new Error(`${LABEL} SELFTEST missing Required trailer escaped`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + 1} independent mutations rejected`);
}
console.log(`${LABEL} PASS — mdata load create shares canonical explicit-or-DRY_VAN trailer equipment persistence`);
