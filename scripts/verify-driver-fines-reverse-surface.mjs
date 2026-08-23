#!/usr/bin/env node
/**
 * GUARD — verify-driver-fines-reverse-surface (CLS-REVERSE-LINKAGE-MISSING / SAF-F16)
 *
 * DEFECT THIS ASSERTS
 * The driver profile carried a dozen ops views and none for fines, so money taken off a driver's
 * settlement had no reverse surface on the driver it was taken from.
 *
 * The trap this guards is UNDER-REPORTING, not absence. There are TWO fines tables and they are not
 * interchangeable: safety.civil_fines is keyed subject_driver_id, safety.internal_fines is keyed
 * driver_id. A panel that reads only one renders, looks wired, and shows a partial list - and a
 * partial fines list on a driver is worse than none, because it reads as complete. So this guard
 * requires BOTH sources, and requires both to be scoped SERVER-side (the internal-fines route caps
 * at LIMIT 500; a client-side filter would silently drop fines once the company crosses that cap).
 *
 * Drill-through: civil → EntityLink kind="safety_fine" (/safety/external-fines?fine_id=);
 * internal → EntityLink kind="internal_fine" (/safety/internal-fines?fine_id=). Both list pages
 * honor fine_id highlight (FinesPage / InternalFinesPage).
 *
 * METHOD: comments stripped before asserting; --selftest mutates the real sources so every
 * assertion is proven able to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-driver-fines-reverse-surface";
const SECTION =
  "apps/frontend/src/components/safety/DriverFinesReverseSection.tsx";
const PAGE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const API = "apps/frontend/src/api/safety.ts";
const ROUTE = "apps/backend/src/safety/safety-v5.routes.ts";
const CIVIL_ROUTE = "apps/backend/src/safety/fines.routes.ts";

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const read = (p) => stripComments(readFileSync(p, "utf8"));

/** Slice out a single exported function body so a file-wide grep cannot satisfy an assertion. */
function fnBody(src, name) {
  const start = src.indexOf(`export function ${name}(`);
  if (start === -1) return "";
  const next = src.indexOf("\nexport function ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

function links(s) {
  const routeStart = s[ROUTE].indexOf('"/api/v1/safety/internal-fines"');
  const routeEnd = s[ROUTE].indexOf("app.patch(", routeStart);
  const route = s[ROUTE].slice(routeStart, routeEnd);
  const civilStart = s[CIVIL_ROUTE].indexOf('"/api/v1/safety/fines"');
  const civilEnd = s[CIVIL_ROUTE].indexOf('"/api/v1/safety/fines/:id"', civilStart);
  const civilList = s[CIVIL_ROUTE].slice(civilStart, civilEnd);
  return [
    {
      ok: /getSafetyFines\(/.test(s[SECTION]),
      why: `${SECTION}: civil fines (safety.civil_fines) are never queried — the panel under-reports`,
    },
    {
      ok: /getInternalFines\(/.test(s[SECTION]),
      why: `${SECTION}: internal fines (safety.internal_fines) are never queried — the panel under-reports`,
    },
    {
      ok: /subject_driver_id:\s*driverId/.test(s[SECTION]),
      why: `${SECTION}: civil fines are not scoped to this driver server-side`,
    },
    {
      ok: /driver_id:\s*driverId/.test(s[SECTION]),
      why: `${SECTION}: internal fines are not scoped to this driver server-side`,
    },
    {
      ok: /kind="safety_fine"/.test(s[SECTION]),
      why: `${SECTION}: civil fines lost their drill-through to the fine record`,
    },
    {
      ok: /kind="internal_fine"/.test(s[SECTION]),
      why: `${SECTION}: internal fines lost their drill-through to the fine record`,
    },
    {
      ok:
        /kind="safety_fines_driver"/.test(s[SECTION]) &&
        !/to="\/safety\/fines"/.test(s[SECTION]),
      why: `${SECTION}: Open Safety must EntityLink the filtered external-fines queue (not dead /safety/fines)`,
    },
    {
      ok: /DriverFinesReverseSection/.test(s[PAGE]),
      why: `${PAGE}: the fines reverse section is not rendered on the driver profile`,
    },
    // Scoped to the specific function bodies: `qs.set("driver_id"` appears four times in this file,
    // so a file-wide match would have passed while the fines call itself was unscoped.
    {
      ok: /qs\.set\("subject_driver_id"/.test(fnBody(s[API], "getSafetyFines")),
      why: `${API}: getSafetyFines drops subject_driver_id — the request would return every fine`,
    },
    {
      ok: /qs\.set\("driver_id"/.test(fnBody(s[API], "getInternalFines")),
      why: `${API}: getInternalFines drops driver_id — the 500-row cap would silently omit fines`,
    },
    {
      ok: /dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(
        route,
      ),
      why: `${ROUTE}: exact-driver internal-fines reverse does not validate owned/authorized parent`,
    },
    {
      ok: /label_dca\.company_id = f\.operating_company_id[\s\S]{0,160}label_dca\.is_authorized = true/.test(
        route,
      ),
      why: `${ROUTE}: authorized shared-driver fine labels are suppressed`,
    },
    {
      ok: /if \(!result\.found\)\s*return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(
        route,
      ),
      why: `${ROUTE}: invalid exact driver renders as a legitimate empty fines history`,
    },
    {
      ok: /dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(
        civilList,
      ),
      why: `${CIVIL_ROUTE}: exact-driver civil-fines reverse does not validate owned/authorized parent`,
    },
    {
      ok:
        (s[CIVIL_ROUTE].match(/label_dca\.company_id = cf\.operating_company_id/g) ?? []).length === 2 &&
        (s[CIVIL_ROUTE].match(/label_dca\.is_authorized = true/g) ?? []).length === 2,
      why: `${CIVIL_ROUTE}: authorized shared-driver civil-fine labels are suppressed in list or detail`,
    },
    {
      ok: /if \(!result\.found\)\s*return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(
        civilList,
      ),
      why: `${CIVIL_ROUTE}: invalid exact driver renders as a legitimate empty civil-fines history`,
    },
  ];
}

const check = (s) =>
  links(s)
    .filter((l) => !l.ok)
    .map((l) => l.why);

function loadAll() {
  const out = {};
  for (const p of [SECTION, PAGE, API, ROUTE, CIVIL_ROUTE]) out[p] = read(p);
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length !== 0) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    [SECTION, (x) => x.replace("getSafetyFines(", "getNothing(")],
    [SECTION, (x) => x.replace("getInternalFines(", "getNothing(")],
    [
      SECTION,
      (x) =>
        x.replace(
          "subject_driver_id: driverId",
          "subject_driver_id: undefined",
        ),
    ],
    [SECTION, (x) => x.replace("driver_id: driverId", "driver_id: undefined")],
    [SECTION, (x) => x.replace('kind="safety_fine"', 'kind="driver"')],
    [SECTION, (x) => x.replace('kind="internal_fine"', 'kind="driver"')],
    [
      PAGE,
      (x) => x.split("DriverFinesReverseSection").join("SomeOtherSection"),
    ],
    [
      API,
      (x) => {
        const i = x.indexOf("export function getSafetyFines(");
        return (
          x.slice(0, i) +
          x.slice(i).replace('qs.set("subject_driver_id"', 'qs.set("ignored"')
        );
      },
    ],
    [
      API,
      (x) => {
        const i = x.indexOf("export function getInternalFines(");
        return (
          x.slice(0, i) +
          x.slice(i).replace('qs.set("driver_id"', 'qs.set("ignored"')
        );
      },
    ],
    [
      ROUTE,
      (x) =>
        x.replace(
          /("\/api\/v1\/safety\/internal-fines"[\s\S]{0,3000}?)dca\.is_authorized = true/,
          "$1TRUE",
        ),
    ],
    [
      ROUTE,
      (x) =>
        x.replace(
          /("\/api\/v1\/safety\/internal-fines"[\s\S]{0,5000}?)label_dca\.is_authorized = true/,
          "$1TRUE",
        ),
    ],
    [
      ROUTE,
      (x) =>
        x.replace(
          /("\/api\/v1\/safety\/internal-fines"[\s\S]{0,7000}?)if \(!result\.found\)\s*return reply\.code\(404\)/,
          "$1if (false) return reply.code(404)",
        ),
    ],
    [
      CIVIL_ROUTE,
      (x) =>
        x.replace(
          /("\/api\/v1\/safety\/fines"[\s\S]{0,3000}?)dca\.is_authorized = true/,
          "$1TRUE",
        ),
    ],
    [
      CIVIL_ROUTE,
      (x) => x.replace("label_dca.is_authorized = true", "TRUE"),
    ],
    [
      CIVIL_ROUTE,
      (x) =>
        x.replace(
          /("\/api\/v1\/safety\/fines"[\s\S]{0,7000}?)if \(!result\.found\)\s*return reply\.code\(404\)/,
          "$1if (false) return reply.code(404)",
        ),
    ],
  ];

  for (const [file, mutate] of mutations) {
    const broken = { ...real, [file]: mutate(real[file]) };
    if (broken[file] === real[file]) {
      console.error(
        `${LABEL} --selftest FAIL — a mutation on ${file} changed nothing (guard is stale).`,
      );
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(
        `${LABEL} --selftest FAIL — breaking ${file} was NOT detected.`,
      );
      process.exit(1);
    }
  }

  console.log(
    `${LABEL} --selftest PASS — all ${mutations.length} assertions proven able to fail.`,
  );
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length > 0) {
  console.error(
    `${LABEL} FAIL — driver fines reverse surface is broken at ${errors.length} point(s):`,
  );
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — driver profile surfaces BOTH civil and internal fines, each scoped server-side, ` +
    `with EntityLink drills for safety_fine + internal_fine.`,
);
