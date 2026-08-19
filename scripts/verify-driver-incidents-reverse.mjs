#!/usr/bin/env node
/** @matrix-built {"modules":["safety","drivers"],"cols":["driver","load","connectivity","reverse_link","picker_law"],"leafRe":"^cargo_claims\\.(list|create)$|^profiles\\.detail$","task":"THEATER-DRIVER-INCIDENTS-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-driver-incidents-reverse";
const files = {
  create: fs.readFileSync("apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", "utf8"),
  routes: fs.readFileSync("apps/backend/src/safety/incidents.routes.ts", "utf8"),
  reverse: fs.readFileSync("apps/frontend/src/components/safety/DriverIncidentsReverseSection.tsx", "utf8"),
  profile: fs.readFileSync("apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "utf8"),
};

const incidentRows = [
  /\{\s*kind:\s*"damage_report",\s*label:\s*"Damage reports",\s*openKind:\s*"damage_reports_driver"\s*\}/,
  /\{\s*kind:\s*"trailer_interchange",\s*label:\s*"Trailer interchanges",\s*openKind:\s*"trailer_interchanges_driver"\s*\}/,
  /\{\s*kind:\s*"cargo_claim",\s*label:\s*"Cargo claims",\s*openKind:\s*"cargo_claims_driver"\s*\}/,
];

function audit(s = files) {
  const failures = [];
  if (!/kind="driver"/.test(s.create) || !/driver_id: form\.driverId \|\| null/.test(s.create)) failures.push("driver picker payload");
  if (!/driver_id: z\.string\(\)\.uuid\(\)\.optional/.test(s.routes) || !/i\.driver_id = \$\$\{params\.length\}/.test(s.routes)) failures.push("exact driver route filter");
  if (!incidentRows.every((pattern) => pattern.test(s.reverse)) || !/driver_id: driverId/.test(s.reverse)) failures.push("all incident reverse filters");
  if (!/kind=\{openKind\}/.test(s.reverse) || !/EntityLinkOrTombstone kind=\{kind\}/.test(s.reverse) || !/EntityLinkOrTombstone kind="load"/.test(s.reverse) || !/row\.id == null \? null : String\(row\.id\)/.test(s.reverse) || !/name=\{row\.load_number\}/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/are linked to this driver/.test(s.reverse)) failures.push("drills, tombstones, or honest states");
  if (!/DriverIncidentsReverseSection operatingCompanyId=\{operatingCompanyId\} driverId=\{driverId\}/.test(s.profile)) failures.push("shared driver reverse mount");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", { ...files, create: files.create.replaceAll('kind="driver"', 'kind="unit"') }],
    ["payload", { ...files, create: files.create.replaceAll("driver_id: form.driverId || null", "driver_id: null") }],
    ["schema", { ...files, routes: files.routes.replace("driver_id: z.string", "wrong_id: z.string") }],
    ["filter", { ...files, routes: files.routes.replace("i.driver_id = $${params.length}", "TRUE") }],
    ["damage", { ...files, reverse: files.reverse.replace('{ kind: "damage_report", label: "Damage reports", openKind: "damage_reports_driver" }', '{ kind: "other", label: "Damage reports", openKind: "damage_reports_driver" }') }],
    ["interchange", { ...files, reverse: files.reverse.replace('{ kind: "trailer_interchange", label: "Trailer interchanges", openKind: "trailer_interchanges_driver" }', '{ kind: "other", label: "Trailer interchanges", openKind: "trailer_interchanges_driver" }') }],
    ["claim", { ...files, reverse: files.reverse.replace('{ kind: "cargo_claim", label: "Cargo claims", openKind: "cargo_claims_driver" }', '{ kind: "other", label: "Cargo claims", openKind: "cargo_claims_driver" }') }],
    ["open drill", { ...files, reverse: files.reverse.replace("kind={openKind}", 'kind="load"') }],
    ["record drill", { ...files, reverse: files.reverse.replace("kind={kind}", 'kind="load"') }],
    ["record tombstone", { ...files, reverse: files.reverse.replace("row.id == null ? null : String(row.id)", "String(row.id)") }],
    ["load tombstone", { ...files, reverse: files.reverse.replace('EntityLinkOrTombstone kind="load"', 'EntityLink kind="load"') }],
    ["empty", { ...files, reverse: files.reverse.replace("are linked to this driver", "exist") }],
    ["mount", { ...files, profile: files.profile.replaceAll("DriverIncidentsReverseSection", "MissingIncidentReverse") }],
  ];
  for (const [name, mutation] of mutations) {
    if (audit(mutation).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} exact mutations detected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — incident driver picker/FK→exact filter→shared driver reverse→claim/load drills`);
