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
  need(/ensureDriverBillArtifactsForLoad,[\s\S]{0,120}resolveLoadTrailerEquipmentIdForInsert/.test(source.loads), "mdata creator must import the canonical resolver");
  need(/load_trailer_equipment_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(source.loads), "mdata create schema must accept an optional canonical equipment FK");
  need(/const loadTrailerEquipmentId = await resolveLoadTrailerEquipmentIdForInsert\([\s\S]{0,180}b\.operating_company_id,[\s\S]{0,100}b\.load_trailer_equipment_id/.test(create), "mdata creator must resolve explicit-or-DRY_VAN equipment before INSERT");
  need(/is_sample_data, load_trailer_equipment_id[\s\S]{0,180}\$13,\$14/.test(create), "mdata INSERT must persist load_trailer_equipment_id in lockstep");
  need(/b\.is_sample_data \?\? false,[\s\S]{0,80}loadTrailerEquipmentId/.test(create), "mdata INSERT values must carry the resolved equipment FK");
  need(/RETURNING[\s\S]{0,500}load_trailer_equipment_id/.test(create), "mdata create response must reload the persisted equipment FK");
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
  const mutations = [
    ["book", /export async function resolveLoadTrailerEquipmentIdForInsert/, "async function resolveLoadTrailerEquipmentIdForInsert"],
    ["loads", /resolveLoadTrailerEquipmentIdForInsert,/, ""],
    ["loads", /load_trailer_equipment_id: z\.string\(\)\.uuid\(\)\.optional\(\),/, ""],
    ["loads", /const loadTrailerEquipmentId = await resolveLoadTrailerEquipmentIdForInsert/, "const loadTrailerEquipmentId = await Promise.resolve"],
    ["loads", /, load_trailer_equipment_id\n\s*\) VALUES/, "\n                ) VALUES"],
    ["loads", /b\.is_sample_data \?\? false,\n\s*loadTrailerEquipmentId,/, "b.is_sample_data ?? false,"],
    ["loads", /is_sample_data, load_trailer_equipment_id,\n/, "is_sample_data,\n"],
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
  console.log(`${LABEL} SELFTEST PASS — 9 independent mutations rejected`);
}
console.log(`${LABEL} PASS — mdata load create shares canonical explicit-or-DRY_VAN trailer equipment persistence`);
