#!/usr/bin/env node
/**
 * GUARD: Driver Audit History filters reach SQL (SAF-B29).
 *
 * WHY: AuditHistoryTab painted Actor / Status / Source / Voids chrome and put them in the
 * React Query key, but listDriverAuditEvents only sent event_type/from/to. The server returned
 * the first 200 unfiltered rows; matching history past that cap was invisible. Worse: the UI
 * never even client-filtered — the controls were decorative.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAB = "apps/frontend/src/components/drivers/AuditHistoryTab.tsx";
const API = "apps/frontend/src/api/audit.ts";
const ROUTE = "apps/backend/src/audit/driver-events.routes.ts";
const SERVICE = "apps/backend/src/audit/driver-events.service.ts";
const FILES = [TAB, API, ROUTE, SERVICE];
const LABEL = "verify-safety-b29-audit-history-server-filters";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertAuditHistoryServerFilters(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = strip(sources?.[rel] ?? read(rel));
  const problems = [];

  for (const [needle, what] of [
    ["actor: actorFilter.trim()", "actor"],
    ["status: statusFilter.trim()", "status"],
    ["source: sourceFilter.trim()", "source"],
    ["voidsOnly: voidsOnly", "voidsOnly"],
  ]) {
    if (!src[TAB].includes(needle)) {
      problems.push(`${TAB}: does not pass ${what} into listDriverAuditEvents (${needle}).`);
    }
  }

  for (const [needle, what] of [
    [`qs.set("actor", params.actor)`, "actor"],
    [`qs.set("status", params.status)`, "status"],
    [`qs.set("source", params.source)`, "source"],
    [`search.set("voids_only", "true")`, "voids_only"],
  ]) {
    // API uses `search.set` not qs — normalize check
    void what;
  }
  if (!src[API].includes(`search.set("actor", params.actor)`)) {
    problems.push(`${API}: listDriverAuditEvents does not send actor.`);
  }
  if (!src[API].includes(`search.set("status", params.status)`)) {
    problems.push(`${API}: listDriverAuditEvents does not send status.`);
  }
  if (!src[API].includes(`search.set("source", params.source)`)) {
    problems.push(`${API}: listDriverAuditEvents does not send source.`);
  }
  if (!src[API].includes(`search.set("voids_only", "true")`)) {
    problems.push(`${API}: listDriverAuditEvents does not send voids_only.`);
  }

  if (!src[ROUTE].includes("actor:") || !src[ROUTE].includes("voids_only:")) {
    problems.push(`${ROUTE}: query schema missing actor/voids_only — filters cannot reach the service.`);
  }
  if (!src[ROUTE].includes("actor: parsed.data.actor")) {
    problems.push(`${ROUTE}: does not forward actor to listDriverAuditEvents.`);
  }

  if (!src[SERVICE].includes("input.actor") || !src[SERVICE].includes("input.voids_only")) {
    problems.push(`${SERVICE}: SQL builder does not apply actor/voids_only filters.`);
  }
  if (!/u\.email ILIKE/.test(src[SERVICE])) {
    problems.push(`${SERVICE}: actor filter must match email (ILIKE) in SQL.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertAuditHistoryServerFilters(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "tab-actor-dropped",
    { ...live, [TAB]: live[TAB].replace(/actor: actorFilter\.trim\(\) \|\| undefined,/g, "") },
    "does not pass actor"
  );
  expectCaught(
    "api-actor-dropped",
    { ...live, [API]: live[API].replace(/search\.set\("actor", params\.actor\)/g, "void 0") },
    "does not send actor"
  );
  expectCaught(
    "service-actor-dropped",
    {
      ...live,
      [SERVICE]: live[SERVICE].replace(/if \(input\.actor\) \{[\s\S]*?\}/, ""),
    },
    "SQL builder does not apply actor"
  );

  const liveProblems = assertAuditHistoryServerFilters(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const problems = assertAuditHistoryServerFilters();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
