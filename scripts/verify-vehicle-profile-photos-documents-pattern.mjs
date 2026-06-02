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

if (!migration.includes("mdata.unit_photos")) {
  console.error("verify:vehicle-profile-photos-documents-pattern FAIL: unit_photos missing in migration");
  process.exit(1);
}
if (all.includes("unit_documents")) {
  console.error("verify:vehicle-profile-photos-documents-pattern FAIL: mdata.unit_documents must not exist");
  process.exit(1);
}
if (!docsRoute.includes("docs.file_links") || !docsRoute.includes("docs.files")) {
  console.error("verify:vehicle-profile-photos-documents-pattern FAIL: docs.files pattern missing");
  process.exit(1);
}
if (!photosRoute.includes("mdata.unit_photos")) {
  console.error("verify:vehicle-profile-photos-documents-pattern FAIL: unit_photos routes missing");
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
