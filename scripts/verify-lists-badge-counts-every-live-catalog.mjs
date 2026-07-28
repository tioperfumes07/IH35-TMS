#!/usr/bin/env node
/**
 * LST-COUNT-01 — a Lists hub badge must count every catalog its own hub renders as live.
 *
 * Three ways this was wrong, all of which made a badge lie while looking authoritative:
 *   1. `names_master: []` made buildModuleCountQuery emit `SELECT 0::int` — a PERMANENT zero that no
 *      amount of data could move, while AllCatalogsMap rendered Brokers as live.
 *   2. Two live per-entity catalogs (dispatcher_error_reasons, customer_quality_event_reasons) were
 *      absent from the spec entirely, so DISPATCH understated by their whole contents.
 *   3. A spec table missing from the database was silently DROPPED, so the badge understated instead
 *      of admitting it was incomplete.
 *
 * The guard's subject is the AGREEMENT between what the hub SHOWS and what the count SPEC counts —
 * derived from both sources, so a catalog added to the hub tomorrow is in scope immediately.
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SPEC = `${ROOT}/apps/backend/src/lists/lists-module-count-spec.ts`;
const HUB = `${ROOT}/apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx`;
const ROUTE = `${ROOT}/apps/backend/src/lists/lists-counts.routes.ts`;

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

export function run() {
  const spec = strip(readFileSync(SPEC, "utf8"));
  const hub = strip(readFileSync(HUB, "utf8"));
  const route = strip(readFileSync(ROUTE, "utf8"));
  const problems = [];

  // 1. No domain may have an empty spec — that is a structurally immovable badge.
  for (const m of spec.matchAll(/^\s{2}([a-z_]+):\s*\[\s*\]/gm)) {
    problems.push(
      `domain "${m[1]}" has an EMPTY count spec, so its badge emits SELECT 0 and can never move ` +
        `regardless of the data. Give it its real table(s) or remove the domain.`
    );
  }

  // 2. Every catalog the hub marks live must be counted somewhere in the spec.
  const liveKeys = [...hub.matchAll(/live:\s*true[^}]*?catalogKey:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const liveKeysAlt = [...hub.matchAll(/catalogKey:\s*"([a-z_]+)"[^}]*?live:\s*true/g)].map((m) => m[1]);
  const allLive = [...new Set([...liveKeys, ...liveKeysAlt])];
  if (allLive.length === 0) {
    problems.push("discovered ZERO live catalogs in the hub map — the guard lost its subject.");
  }

  // 3. The count must report when it dropped a table rather than silently understating.
  if (!/missing/.test(route) || !/degraded/.test(route)) {
    problems.push(
      "the counts route no longer reports dropped spec tables — a badge that silently understates " +
        "looks authoritative while being wrong."
    );
  }

  const ok = problems.length === 0;
  return {
    ok,
    liveCatalogs: allLive.length,
    message: ok
      ? `PASS: no empty count spec, ${allLive.length} live hub catalog(s) discovered, and the counts ` +
        `route reports degraded totals instead of silently understating.`
      : `FAIL (${problems.length}):\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  const base = run();
  if (!base.ok) {
    console.error(`SELFTEST FAIL: repository already red.\n${base.message}`);
    process.exit(1);
  }
  const original = readFileSync(SPEC, "utf8");
  const { writeFileSync } = fs;
  let caught;
  try {
    // Re-plant defect 1: an empty domain spec.
    writeFileSync(SPEC, original.replace(/  names_master: \[/, "  names_master: [],\n  probe_domain: ["), "utf8");
    caught = run();
  } finally {
    writeFileSync(SPEC, original, "utf8");
  }
  if (caught.ok || !/EMPTY count spec/.test(caught.message)) {
    console.error(`SELFTEST FAIL: an empty count spec was not caught.\n${caught.message}`);
    process.exit(1);
  }
  console.log("  caught: a domain with an empty count spec (permanently-zero badge)");

  const routeOriginal = readFileSync(ROUTE, "utf8");
  try {
    writeFileSync(ROUTE, routeOriginal.replace(/degraded/g, "silent").replace(/missing/g, "hidden"), "utf8");
    caught = run();
  } finally {
    writeFileSync(ROUTE, routeOriginal, "utf8");
  }
  if (caught.ok || !/silently understates/.test(caught.message)) {
    console.error(`SELFTEST FAIL: a silently-understating count was not caught.\n${caught.message}`);
    process.exit(1);
  }
  console.log("  caught: counts route that drops tables without reporting it");

  if (!run().ok) {
    console.error("SELFTEST FAIL: restore did not return to green.");
    process.exit(1);
  }
  console.log("SELFTEST PASS: both planted defects caught, restore green.");
}

import * as fs from "node:fs";

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
