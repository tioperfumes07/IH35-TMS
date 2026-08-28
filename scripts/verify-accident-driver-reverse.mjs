#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["accidents.create"],"task":"SAF-F5894-ACCIDENT-CREATE-REVERSE-EXACT","vertical":"class-sweep"} */
// LINK-THEATER-01 narrowing (2026-08-14): the prior tag claimed "dispatch" as a module and leafRe=".*"
// (shorthand default) across safety+drivers+dispatch — Built for every leaf in three modules. This
// guard's 4 assertions read exactly 4 files: AccidentsPage.tsx (driver picker + FK writer,
// /safety/accidents, leaves accidents.list + accidents.create — one component serves both),
// safety.routes.ts + safety.ts (server filter/API), and DriverSafetyReverseSection.tsx (the reverse
// mount). "dispatch" was never justified — zero dispatch file is read anywhere in this guard.
// DriverSafetyReverseSection is mounted on BOTH DriverProfilePage.tsx (profiles.detail, tracked) AND
// DriverDetail.tsx (/drivers/:id, still untracked in drivers.required.json — same gap noted in
// LINK-F5145/verify-driver-report-driver-reverse.mjs; not fixed here either, still open).
import fs from "node:fs";
const L = "verify-accident-driver-reverse",
  GUARD = "scripts/verify-accident-driver-reverse.mjs",
  HEADER =
    '/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["accidents.create"],"task":"SAF-F5894-ACCIDENT-CREATE-REVERSE-EXACT","vertical":"class-sweep"} */',
  c = fs.readFileSync(
    "apps/frontend/src/pages/safety/AccidentsPage.tsx",
    "utf8",
  ),
  r = fs.readFileSync("apps/backend/src/safety/safety.routes.ts", "utf8"),
  a = fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  v = fs.readFileSync(
    "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
    "utf8",
  ),
  matrix = fs.readFileSync(
    "docs/specs/scoreboard/modules/safety.required.json",
    "utf8",
  ),
  feed = fs.readFileSync(
    "docs/specs/scoreboard/wire-sprint-built.json",
    "utf8",
  ),
  self = fs.readFileSync(GUARD, "utf8");
function audit(w, x, y, z, m = matrix, fd = feed, sl = self) {
  const f = [];
  const routeStart = x.indexOf('"/api/v1/safety/accidents"');
  const routeEnd = x.indexOf("app.get(", routeStart + 30);
  const accidentRoute = routeStart >= 0 ? x.slice(routeStart, routeEnd < 0 ? x.length : routeEnd) : "";
  if (!/kind="driver"/.test(w)) f.push("driver picker");
  if (!/driver_id: nullableUuid/.test(x)) f.push("driver FK writer");
  if (
    !/driver_id: z\.string\(\)\.uuid\(\)\.optional/.test(x) ||
    !/ar\.driver_id = \$\$\{values\.length\}/.test(x)
  )
    f.push("exact server driver filter");
  if (
    !/dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(
      accidentRoute,
    )
  )
    f.push("owned/authorized parent validation");
  if (
    !/label_dca\.company_id = ar\.operating_company_id[\s\S]{0,160}label_dca\.is_authorized = true/.test(
      accidentRoute,
    )
  )
    f.push("authorized driver label");
  if (
    !/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(
      accidentRoute,
    )
  )
    f.push("honest invalid parent");
  if (
    !/u\.unit_number AS unit_number/.test(x) ||
    !/tr\.equipment_number AS trailer_number/.test(x) ||
    !/l\.load_number AS load_number/.test(x) ||
    !/v\.vendor_name AS vendor_name/.test(x)
  )
    f.push("scoped producer labels");
  if (
    !/params: \{ driver_id\?: string; unit_id\?: string/.test(y) ||
    !/params\.driver_id/.test(y)
  )
    f.push("driver filter API");
  if (
    !/getSafetyAccidents\(operatingCompanyId, \{ driver_id: driverId, limit: accidentPageSize, offset: \(accidentPage - 1\) \* accidentPageSize \}\)/.test(
      z,
    )
  )
    f.push("exact reverse");
  if (!/driver-safety-reverse-accidents/.test(z) || !/kind="accident"/.test(z))
    f.push("profile drills");
  if (
    !/<EntityLinkOrTombstone kind="load"[\s\S]{0,100}id=\{s\(accident\.load_id\)\}[\s\S]{0,100}name=\{accident\.load_number\}/.test(
      z,
    )
  )
    f.push("load accident tombstone-aware drill");
  for (const [kind, id, name] of [
    ["unit", "unit_id", "unit_number"],
    ["trailer", "trailer_id", "trailer_number"],
    ["vendor", "vendor_id", "vendor_name"],
  ])
    if (
      !new RegExp(
        `kind="${kind}"[\\s\\S]{0,100}id=\\{s\\(accident\\.${id}\\)\\}[\\s\\S]{0,100}name=\\{accident\\.${name}\\}`,
      ).test(z)
    )
      f.push(`${kind} accident drill`);
  if (
    !/accidentsQuery\.isError/.test(z) ||
    !/No accident reports for this driver/.test(z)
  )
    f.push("honest states");
  let parsed;
  try {
    parsed = JSON.parse(m);
  } catch (e) {
    f.push(`Safety matrix parse: ${e.message}`);
  }
  const leaf = parsed?.leaves?.find((q) => q.id === "accidents.create");
  if (!leaf?.required?.includes("reverse_link"))
    f.push("accidents.create must require reverse_link");
  if (leaf?.route_hint !== "/safety/accidents")
    f.push("accidents.create route must remain mounted");
  if (!sl.split('import fs from "node:fs";')[0].includes(HEADER))
    f.push("exact accidents.create header missing");
  try {
    if (JSON.parse(fd).entries?.some((e) => e.guard === GUARD))
      f.push("manual feed must not duplicate exact ownership");
  } catch (e) {
    f.push(`feed parse: ${e.message}`);
  }
  return f;
}
if (process.argv.includes("--selftest")) {
  const m = [
    ["picker", c.replace(/kind="driver"/g, 'kind="unit"'), r, a, v],
    [
      "writer",
      c,
      r.replaceAll("driver_id: nullableUuid", "driver_id: z.never()"),
      a,
      v,
    ],
    [
      "schema",
      c,
      r.replaceAll(
        "driver_id: z.string().uuid().optional",
        "wrong_id: z.string().uuid().optional",
      ),
      a,
      v,
    ],
    [
      "sql",
      c,
      r.replace(/ar\.driver_id = \$\$\{values\.length\}/, "TRUE"),
      a,
      v,
    ],
    [
      "parent-auth",
      c,
      r.replace(
        /("\/api\/v1\/safety\/accidents"[\s\S]{0,4000}?)dca\.is_authorized = true/,
        "$1TRUE",
      ),
      a,
      v,
    ],
    [
      "label-auth",
      c,
      r.replace(
        /("\/api\/v1\/safety\/accidents"[\s\S]{0,6000}?)label_dca\.is_authorized = true/,
        "$1TRUE",
      ),
      a,
      v,
    ],
    [
      "parent-404",
      c,
      r.replace(
        /("\/api\/v1\/safety\/accidents"[\s\S]{0,9000}?)if \(!result\.found\) return reply\.code\(404\)/,
        "$1if (false) return reply.code(404)",
      ),
      a,
      v,
    ],
    [
      "producer-unit",
      c,
      r.replace("u.unit_number AS unit_number", "NULL AS unit_number"),
      a,
      v,
    ],
    [
      "producer-load",
      c,
      r.replace(
        "l.load_number AS load_number",
        "ar.load_id::text AS load_number",
      ),
      a,
      v,
    ],
    [
      "api",
      c,
      r,
      a.replaceAll(
        "params: { driver_id?: string; unit_id?: string",
        "params: { unit_id?: string",
      ),
      v,
    ],
    ["filter", c, r, a, v.replaceAll("driver_id: driverId", "driver_id: ''")],
    ["reverse-range", c, r, a, v.replace("limit: accidentPageSize, offset: (accidentPage - 1) * accidentPageSize", "limit: 1, offset: 0")],
    [
      "section",
      c,
      r,
      a,
      v.replaceAll("driver-safety-reverse-accidents", "missing"),
    ],
    ["accident", c, r, a, v.replaceAll('kind="accident"', 'kind="load"')],
    [
      "load-tombstone",
      c,
      r,
      a,
      v.replace(
        '<EntityLinkOrTombstone kind="load"',
        '<EntityLink kind="load"',
      ),
    ],
    ["unit", c, r, a, v.replace('kind="unit"', 'kind="load"')],
    ["trailer", c, r, a, v.replace('kind="trailer"', 'kind="load"')],
    ["vendor", c, r, a, v.replace('kind="vendor"', 'kind="load"')],
    ["error", c, r, a, v.replace(/accidentsQuery\.isError/g, "false")],
    [
      "empty",
      c,
      r,
      a,
      v.replace(/No accident reports for this driver/, "No rows"),
    ],
  ];
  for (const [n, w, x, y, z] of m)
    if (!audit(w, x, y, z).length) {
      console.error(`${L} SELFTEST FAIL — ${n}`);
      process.exit(1);
    }
  const idToken = '"id": "accidents.create"',
    start = matrix.indexOf(idToken),
    end = matrix.indexOf("\n    {", start + idToken.length),
    block = matrix.slice(start, end < 0 ? matrix.length : end);
  for (const [token, replacement] of [
    [idToken, '"id": "accidents.create.broken"'],
    ['"reverse_link"', '"reverse_link_broken"'],
    ['"route_hint": "/safety/accidents"', '"route_hint": "broken"'],
  ]) {
    const changed =
      matrix.slice(0, start) +
      block.replace(token, replacement) +
      matrix.slice(end < 0 ? matrix.length : end);
    if (!audit(c, r, a, v, changed).length)
      throw new Error(`matrix mutation survived ${token}`);
  }
  const broken = HEADER.replace(
    '"vertical":"class-sweep"',
    '"vertical":"broken"',
  );
  if (!audit(c, r, a, v, matrix, feed, self.replace(HEADER, broken)).length)
    throw new Error("header mutation survived");
  const fj = JSON.parse(feed);
  fj.entries.unshift({
    guard: GUARD,
    modules: ["safety"],
    cols: ["reverse_link"],
    leafRe: ".*",
  });
  if (!audit(c, r, a, v, matrix, JSON.stringify(fj)).length)
    throw new Error("feed mutation survived");
  console.log(`${L} SELFTEST PASS — 25 mutations detected`);
  process.exit(0);
}
const f = audit(c, r, a, v);
if (f.length) {
  console.error(`${L} FAIL\n- ${f.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `${L} PASS — accident driver picker/FK→exact reverse→driver profiles→accident/load/unit/trailer/vendor drills`,
);
