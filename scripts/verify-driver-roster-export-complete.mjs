#!/usr/bin/env node
/**
 * GUARD — verify-driver-roster-export-complete (CLS-SILENT-CAP, instance 1)
 *
 * DEFECT THIS ASSERTS
 * The Drivers "Export profiles (CSV)" button requested `limit: 500` in a single call while the
 * backend clamps limit to max(200) (mdata/drivers.routes.ts listQuerySchema). So it did NOT
 * truncate at 500 as the audit card assumed — the request failed zod validation and 400'd, and with
 * no catch on the handler the rejection was swallowed and `exporting` simply reset. Clicking Export
 * produced no file and no error.
 *
 * Two distinct failures, both guarded here because either one alone re-breaks the export:
 *   1. an over-limit request (silent 400), and
 *   2. a silently SHORT file — a roster CSV is read offline, where nobody can see who is missing,
 *      so the handler must refuse to download rather than hand over an incomplete export.
 *
 * The cap is read from the BACKEND SCHEMA at runtime rather than hardcoded here, so if someone
 * raises or lowers listQuerySchema's max, this guard tracks it instead of silently going stale.
 *
 * Scope: listDrivers callers only. Other entities' list calls use different backend caps; asserting
 * a shared number across them would be a guess, and a guard built on a guess is worse than none.
 *
 * METHOD: comments stripped before asserting; --selftest mutates the real sources to prove each
 * assertion can fail.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-driver-roster-export-complete";
const PAGE = "apps/frontend/src/pages/drivers/DriversListPage.tsx";
const ROUTES = "apps/backend/src/mdata/drivers.routes.ts";
const FRONTEND_SRC = "apps/frontend/src";

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const read = (p) => stripComments(readFileSync(p, "utf8"));

/** The backend's real cap, parsed from the route schema — never hardcoded. */
function backendMaxLimit(routesSrc) {
  const m = routesSrc.match(/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(\d+\)\.max\((\d+)\)/);
  return m ? Number(m[1]) : null;
}

/** Walk the frontend tree once, with dirents, so no stat/read race. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every listDrivers({...}) call site whose literal limit exceeds the backend cap. */
function overLimitCallers(max) {
  const offenders = [];
  for (const file of walk(FRONTEND_SRC)) {
    if (file.endsWith("api/mdata.ts")) continue; // the client itself declares the param, not a value
    const src = stripComments(readFileSync(file, "utf8"));
    let idx = src.indexOf("listDrivers(");
    while (idx !== -1) {
      const call = src.slice(idx, idx + 400);
      const lim = call.match(/limit:\s*(\d+)/);
      if (lim && Number(lim[1]) > max) offenders.push(`${file} (limit: ${lim[1]} > ${max})`);
      idx = src.indexOf("listDrivers(", idx + 1);
    }
  }
  return offenders;
}

function check(sources, max) {
  const errors = [];
  const page = sources[PAGE];

  if (max === null) {
    errors.push(`${ROUTES}: could not read listQuerySchema's limit max — guard cannot verify the cap`);
    return errors;
  }

  const offenders = overLimitCallers(max);
  for (const o of offenders) {
    errors.push(`over-limit listDrivers call (backend 400s, no rows returned): ${o}`);
  }

  // The export must PAGE rather than ask for everything at once.
  if (!/offset:\s*pageIndex\s*\*\s*PAGE/.test(page)) {
    errors.push(`${PAGE}: CSV export does not page through offsets — rows beyond one page are lost`);
  }
  // ...and must refuse a file it knows is short, rather than downloading it silently.
  if (!/was NOT downloaded/.test(page)) {
    errors.push(`${PAGE}: CSV export does not refuse an incomplete file — silent truncation returns`);
  }
  // ...and must surface failures instead of swallowing them.
  if (!/catch\s*\(/.test(page) || !/pushToast\(/.test(page)) {
    errors.push(`${PAGE}: CSV export has no visible error path — a failed export looks like a no-op`);
  }
  return errors;
}

function loadAll() {
  return { [PAGE]: read(PAGE), [ROUTES]: read(ROUTES) };
}

function selftest() {
  const real = loadAll();
  const max = backendMaxLimit(real[ROUTES]);
  const baseline = check(real, max);
  if (baseline.length !== 0) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    ["no paging", (s) => ({ ...s, [PAGE]: s[PAGE].replace(/offset: pageIndex \* PAGE/, "offset: 0") })],
    ["ships short file", (s) => ({ ...s, [PAGE]: s[PAGE].split("was NOT downloaded").join("was downloaded") })],
    ["swallows errors", (s) => ({ ...s, [PAGE]: s[PAGE].split("pushToast(").join("noop(") })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken[PAGE] === real[PAGE]) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken, max).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }

  // The cap must be READ, not assumed: a schema whose max cannot be parsed is itself a failure.
  if (check({ ...real, [ROUTES]: "no schema here" }, backendMaxLimit("no schema here")).length === 0) {
    console.error(`${LABEL} --selftest FAIL — an unreadable backend cap was not detected.`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS — ${mutations.length + 1} mutations all detected (cap read = ${max}).`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const sources = loadAll();
const max = backendMaxLimit(sources[ROUTES]);
const errors = check(sources, max);
if (errors.length > 0) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — no listDrivers caller exceeds the backend cap (${max}), and the roster CSV pages ` +
    `to completion, refuses a short file, and surfaces failures.`
);
