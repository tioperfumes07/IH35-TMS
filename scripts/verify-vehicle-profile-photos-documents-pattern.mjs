#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(ROOT, "db/migrations/0296_vehicle_profile_part2.sql"), "utf8");
const docsRoute = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-documents.routes.ts"), "utf8");
const photosRoute = fs.readFileSync(path.join(ROOT, "apps/backend/src/mdata/unit-photos.routes.ts"), "utf8");
const repo = walk(path.join(ROOT, "apps/backend/src/mdata"));
const all = [migration, docsRoute, photosRoute, ...repo].join("\n");

function failures({ migrationSource = migration, docsSource = docsRoute, photosSource = photosRoute, allSource = all } = {}) {
  const errors = [];
  if (!migrationSource.includes("mdata.unit_photos")) errors.push("unit_photos missing in migration");
  if (allSource.includes("unit_documents")) errors.push("mdata.unit_documents must not exist");
  if (!docsSource.includes("docs.file_links") || !docsSource.includes("docs.files")) errors.push("docs.files pattern missing");
  if (!photosSource.includes("mdata.unit_photos")) errors.push("unit_photos routes missing");
  const start = photosSource.indexOf('app.get("/api/v1/mdata/units/:id/photos"');
  const route = start < 0 ? "" : photosSource.slice(start, start + 2200);
  const parentIndex = route.indexOf("FROM mdata.units");
  const childIndex = route.indexOf("FROM mdata.unit_photos");
  if (!/owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid/.test(route)) {
    errors.push("unit photo reverse GET must verify owner/leased company scope");
  }
  if (!/if \(unit\.rowCount === 0\) return null;[\s\S]*if \(rows === null\) return reply\.code\(404\)\.send\(\{ error: "mdata_unit_not_found" \}\)/.test(route)) {
    errors.push("unit photo reverse GET must return honest unit-not-found before empty photos");
  }
  if (parentIndex < 0 || childIndex < 0 || parentIndex > childIndex) errors.push("unit scope must be checked before photo children");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const baseline = failures();
  const mutations = [
    photosRoute.replace("owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid", "TRUE"),
    photosRoute.replace('return reply.code(404).send({ error: "mdata_unit_not_found" })', "return { photos: [] }"),
    photosRoute.replace("if (unit.rowCount === 0) return null;", ""),
  ];
  if (baseline.length || mutations.some((mutant) => mutant === photosRoute || failures({ photosSource: mutant }).length === 0)) {
    console.error(`verify:vehicle-profile-photos-documents-pattern selftest FAIL${baseline.length ? `: ${baseline.join("; ")}` : ""}`);
    process.exit(1);
  }
  console.log(`verify:vehicle-profile-photos-documents-pattern selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const errors = failures();
if (errors.length) {
  console.error(`verify:vehicle-profile-photos-documents-pattern FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("verify:vehicle-profile-photos-documents-pattern PASS");

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith(".ts")) acc.push(fs.readFileSync(p, "utf8"));
  }
  return acc;
}
