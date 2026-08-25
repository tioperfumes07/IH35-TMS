#!/usr/bin/env node
/**
 * GUARD: Load detail shows safety records linked to that load (SAF-C01 / Law §9 reverse).
 *
 * WHY: accident_reports.load_id and incidents.load_id already persist the trip. LoadDetailDrawer
 * showed Insurance reverse but no Safety — a load looked clean while accidents/cargo claims only
 * existed on Safety screens. DEFINITION-OF-DONE §1.C: forward FK with no reverse surface is NOT done.
 *
 * Pins:
 *   1. LoadSafetyReverseSection reads accidents + damage/trailer-interchange/cargo incidents.
 *   2. Mounted on LoadDetailDrawer with loadId={load.id}.
 *   3. Accidents + incidents list routes filter load_id in SQL (LIMIT 500 — never client-only).
 *   4. Client API sends load_id on both getSafetyAccidents and listSafetyIncidents.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECTION = "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const API = "apps/frontend/src/api/safety.ts";
const ACCIDENTS_ROUTE = "apps/backend/src/safety/safety.routes.ts";
const INCIDENTS_ROUTE = "apps/backend/src/safety/incidents.routes.ts";
const FILES = [SECTION, DRAWER, API, ACCIDENTS_ROUTE, INCIDENTS_ROUTE];
const LABEL = "verify-safety-load-reverse-accidents";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertLoadSafetyReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  if (!src[SECTION].includes("getSafetyAccidents(")) {
    problems.push(`${SECTION}: does not read accidents (getSafetyAccidents) — load reverse is incomplete.`);
  }
  if (!src[SECTION].includes("listSafetyIncidents(")) {
    problems.push(`${SECTION}: does not read incidents — damage/cargo/trailer interchange stay invisible on the load.`);
  }
  if (!src[SECTION].includes("load_id: loadId") && !src[SECTION].includes("load_id: loadId")) {
    problems.push(`${SECTION}: reads are not scoped with load_id.`);
  }
  if (!/load_id:\s*loadId/.test(src[SECTION])) {
    problems.push(`${SECTION}: expected load_id: loadId on reverse queries.`);
  }

  if (!src[DRAWER].includes("LoadSafetyReverseSection")) {
    problems.push(`${DRAWER}: does not mount LoadSafetyReverseSection — load detail still hides safety records.`);
  } else if (!/LoadSafetyReverseSection[\s\S]{0,400}loadId=\{load\.id\}/.test(src[DRAWER])) {
    problems.push(`${DRAWER}: LoadSafetyReverseSection must receive loadId={load.id}.`);
  }

  if (!/ar\.load_id = \$/.test(src[ACCIDENTS_ROUTE])) {
    problems.push(`${ACCIDENTS_ROUTE}: GET accidents does not filter by load_id in SQL — client filter drops rows past LIMIT 500.`);
  }
  if (!/i\.load_id = \$/.test(src[INCIDENTS_ROUTE])) {
    problems.push(`${INCIDENTS_ROUTE}: GET incidents does not filter by load_id in SQL.`);
  }

  if (!src[API].includes(`qs.set("load_id", params.load_id)`)) {
    problems.push(`${API}: getSafetyAccidents does not send load_id — server filter unreachable.`);
  }
  if (!src[API].includes(`qs.set("load_id", filters.load_id)`)) {
    problems.push(`${API}: listSafetyIncidents does not send load_id — server filter unreachable.`);
  }
  if (!/kind="accidents_load"/.test(src[SECTION])) {
    problems.push(`${SECTION}: Open Accidents must EntityLink accidents_load (filtered queue), not a bare /safety/accidents Link.`);
  }
  if (!/openKind: "damage_reports_load"/.test(src[SECTION]) || !/kind=\{kind\.openKind\}/.test(src[SECTION])) {
    problems.push(`${SECTION}: Open Damage/Interchange/Cargo must EntityLink filtered incident queues.`);
  }
  for (const [name, pattern] of [
    ["accidents", /onRetry=\{\(\) => void accidentsQ\.refetch\(\)\}/],
    ["HOS violations", /onRetry=\{\(\) => void hosViolationsQ\.refetch\(\)\}/],
    ["internal fines", /onRetry=\{\(\) => void internalFinesQ\.refetch\(\)\}/],
  ]) {
    if (!pattern.test(src[SECTION])) problems.push(`${SECTION}: ${name} reverse read must expose exact retry.`);
  }
  if ((src[SECTION].match(/onRetry=\{\(\) => void query\.refetch\(\)\}/g) ?? []).length < 2) {
    problems.push(`${SECTION}: safety-event and incident reverse reads must expose exact retry.`);
  }
  for (const pattern of [
    /!accidentsQ\.isError && accidents\.length > 0/,
    /!hosViolationsQ\.isError \? hosViolations\.map/,
    /!internalFinesQ\.isError \? internalFines\.map/,
  ]) {
    if (!pattern.test(src[SECTION])) problems.push(`${SECTION}: failed reverse reads must suppress stale rows.`);
  }
  if ((src[SECTION].match(/!query\.isError && rows\.length > 0/g) ?? []).length < 2) {
    problems.push(`${SECTION}: failed safety-event and incident reads must suppress stale rows.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertLoadSafetyReverse(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "accidents-read-dropped",
    { ...live, [SECTION]: live[SECTION].replace(/getSafetyAccidents\(/g, "noopRemoved(") },
    "does not read accidents"
  );
  expectCaught(
    "drawer-not-mounted",
    { ...live, [DRAWER]: live[DRAWER].replace(/LoadSafetyReverseSection/g, "SomethingElse") },
    "does not mount LoadSafetyReverseSection"
  );
  expectCaught(
    "accidents-sql-removed",
    { ...live, [ACCIDENTS_ROUTE]: live[ACCIDENTS_ROUTE].replace(/AND ar\.load_id = \$\$\{values\.length\}/g, "") },
    "does not filter by load_id in SQL"
  );
  expectCaught(
    "incidents-sql-removed",
    { ...live, [INCIDENTS_ROUTE]: live[INCIDENTS_ROUTE].replace(/i\.load_id = \$\$\{params\.length\}/g, "TRUE") },
    "does not filter by load_id in SQL"
  );
  expectCaught(
    "client-accidents-param",
    { ...live, [API]: live[API].replace(/qs\.set\("load_id", params\.load_id\)/g, "void 0") },
    "getSafetyAccidents does not send load_id"
  );
  expectCaught(
    "client-incidents-param",
    { ...live, [API]: live[API].replace(/qs\.set\("load_id", filters\.load_id\)/g, "void 0") },
    "listSafetyIncidents does not send load_id"
  );
  expectCaught(
    "open-accidents-queue",
    { ...live, [SECTION]: live[SECTION].replace(/kind="accidents_load"/g, 'kind="accident"') },
    "Open Accidents must EntityLink accidents_load"
  );
  expectCaught(
    "open-incident-queues",
    { ...live, [SECTION]: live[SECTION].replace(/kind=\{kind\.openKind\}/g, "to={kind.route}") },
    "Open Damage/Interchange/Cargo must EntityLink"
  );
  expectCaught(
    "accidents-retry",
    { ...live, [SECTION]: live[SECTION].replace("onRetry={() => void accidentsQ.refetch()}", "onRetry={() => undefined}") },
    "accidents reverse read must expose exact retry"
  );
  expectCaught(
    "hos-retry",
    { ...live, [SECTION]: live[SECTION].replace("onRetry={() => void hosViolationsQ.refetch()}", "onRetry={() => undefined}") },
    "HOS violations reverse read must expose exact retry"
  );
  expectCaught(
    "internal-fines-retry",
    { ...live, [SECTION]: live[SECTION].replace("onRetry={() => void internalFinesQ.refetch()}", "onRetry={() => undefined}") },
    "internal fines reverse read must expose exact retry"
  );
  expectCaught(
    "shared-event-retry",
    { ...live, [SECTION]: live[SECTION].replaceAll("onRetry={() => void query.refetch()}", "onRetry={() => undefined}") },
    "safety-event and incident reverse reads must expose exact retry"
  );
  expectCaught(
    "stale-rows",
    { ...live, [SECTION]: live[SECTION].replaceAll("!query.isError && rows.length > 0", "rows.length > 0") },
    "failed safety-event and incident reads must suppress stale rows"
  );

  const liveProblems = assertLoadSafetyReverse(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const problems = assertLoadSafetyReverse();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
