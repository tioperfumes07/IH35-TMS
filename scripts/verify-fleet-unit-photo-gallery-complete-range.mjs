#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["unit","connectivity","reverse_link","qbo_chrome"],"leaves":["unit.profile.documents"],"task":"FLT-F6925-UNIT-PHOTO-GALLERY-SILENT-20-CAP","vertical":"leaf-complete"} */
import fs from "node:fs";

const SERVICE = "apps/backend/src/mdata/unit-aggregate.service.ts";
const GALLERY = "apps/frontend/src/components/vehicle-profile/PhotoGallery.tsx";
const read = (file) => fs.readFileSync(file, "utf8");

function photoQuery(source) {
  return source.match(/const photosRes = await client\.query\([\s\S]*?\n  \);/)?.[0] ?? "";
}

export function verify(sources = {}) {
  const service = sources.service ?? read(SERVICE);
  const gallery = sources.gallery ?? read(GALLERY);
  const query = photoQuery(service);
  const checks = [
    ["unit photo query exists", query.length > 0],
    ["company and unit scope", /p\.unit_id = \$1::uuid/.test(query) && /p\.operating_company_id = \$2::uuid/.test(query)],
    ["archive predicate", /p\.archived_at IS NULL/.test(query)],
    ["stable complete order", /ORDER BY p\.taken_at DESC NULLS LAST, p\.created_at DESC/.test(query)],
    ["no silent row cap", !/\bLIMIT\s+\d+/i.test(query) && !/\bFETCH\s+FIRST\b/i.test(query)],
    ["unit-empty truth", /No unit photos yet\./.test(gallery) && !/No driver photos yet\./.test(gallery)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = { service: read(SERVICE), gallery: read(GALLERY) };
  const mutations = [
    ["reintroduced cap", { ...live, service: live.service.replace("ORDER BY p.taken_at DESC NULLS LAST, p.created_at DESC", "ORDER BY p.taken_at DESC NULLS LAST, p.created_at DESC\n      LIMIT 20") }],
    ["dropped company scope", { ...live, service: live.service.replace("AND p.operating_company_id = $2::uuid", "AND TRUE") }],
    ["wrong empty identity", { ...live, gallery: live.gallery.replace("No unit photos yet.", "No driver photos yet.") }],
  ];
  for (const [name, sources] of mutations) {
    if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} unit-photo gallery regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: Fleet unit photo gallery reads the complete scoped canonical range");
}
