#!/usr/bin/env node
/**
 * verify-settlements-load-ids-reverse-link.mjs
 *
 * @matrix-built {"modules":["settlements"],"cols":["reverse_link"],"leafRe":"^(settlements\\.list|pre_settlements|settlements\\.panel\\.pre_settlements)$","task":"SETL-LIST-LOAD-REVERSE"}
 *
 * P14 Box4 gap: settlements.panel.pre_settlements's `load`/`reverse_link` cells were unpaid because
 * SettlementListRow only ever carried `load_count` (a number), never the actual load ids — the
 * pre-settlements panel rendered "N load(s)" as plain text, no drill target existed.
 *
 * The same API already returns load_ids on the main Settlements list, but SettlementsTable's Loads
 * column still printed only the count — McLeod/Alvys reverse drill from the list was dead.
 *
 * Guards:
 *  1. Both settlements.routes.ts list queries select a load_ids array_agg alongside load_count,
 *     using the same COALESCE/JOIN/WHERE shape (copy-paste drift would silently disagree).
 *  2. Both response-mapping blocks include load_ids in the returned row.
 *  3. PreSettlementsPanel.tsx renders a real EntityLink kind="load" per id, not just the count.
 *  4. SettlementsTable Loads column drills kind="load" from load_ids (honest count fallback).
 */
import { readFileSync } from "node:fs";

const routesPath = "apps/backend/src/driver-finance/settlements.routes.ts";
const panelPath = "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx";
const tablePath = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";
const apiTypePath = "apps/frontend/src/api/driverFinance.ts";
const source = {
  routes: readFileSync(routesPath, "utf8"),
  panel: readFileSync(panelPath, "utf8"),
  table: readFileSync(tablePath, "utf8"),
  api: readFileSync(apiTypePath, "utf8"),
};

function handler(src, start, end) {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  return from >= 0 ? src.slice(from, to >= 0 ? to : undefined) : "";
}

export function collectFailures(src = source) {
  const failures = [];
  const general = handler(src.routes, 'app.get("/api/v1/driver-finance/settlements"', 'app.get("/api/v1/drivers/:id/settlements"');
  const driver = handler(src.routes, 'app.get("/api/v1/drivers/:id/settlements"', 'app.get("/api/v1/driver-finance/settlements/:id"');
  for (const [name, block] of [["general list", general], ["driver reverse list", driver]]) {
    if (!/array_agg\(DISTINCT COALESCE\(db\.load_id, sl\.load_id\)\)/.test(block)) {
      failures.push(`${routesPath}: ${name} must project canonical load_ids`);
    }
    if (!/load_ids:\s*Array\.isArray\(row\.load_ids\)/.test(block)) {
      failures.push(`${routesPath}: ${name} response must map load_ids`);
    }
    if (!/jsonb_agg\(jsonb_build_object\('id', linked\.load_id::text, 'label', l\.load_number\)/.test(block) || !/l\.operating_company_id = s\.operating_company_id/.test(block)) {
      failures.push(`${routesPath}: ${name} must project company-scoped human load links`);
    }
    if (!/load_links:\s*Array\.isArray\(row\.load_links\)/.test(block)) {
      failures.push(`${routesPath}: ${name} response must map human load links`);
    }
  }
  if (!/settlement\.load_links[\s\S]{0,500}?kind="load"[\s\S]{0,120}?id=\{link\.id\}[\s\S]{0,160}entityLabel\(link\.label, link\.id, "Load"\)/.test(src.panel)) {
    failures.push(`${panelPath}: must drill each settlement.load_links row with its human label`);
  }
  if (!/row\.load_links[\s\S]{0,500}?kind="load"[\s\S]{0,120}?id=\{link\.id\}[\s\S]{0,160}entityLabel\(link\.label, link\.id, "Load"\)/.test(src.table)) {
    failures.push(`${tablePath}: Loads column must drill each row.load_links value with its human label`);
  }
  if (!/load_ids\?:\s*string\[\]/.test(src.api)) {
    failures.push(`${apiTypePath}: SettlementListRow no longer declares load_ids`);
  }
  if (!/load_links\?:\s*Array<\{ id: string; label: string \}>/.test(src.api)) {
    failures.push(`${apiTypePath}: SettlementListRow must declare human load links`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-settlements-load-ids-reverse-link SELFTEST FAILED: good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const mutations = [
    ["general producer", "routes", /array_agg\(DISTINCT COALESCE\(db\.load_id, sl\.load_id\)\)/, "array_agg(NULL)"],
    ["driver producer", "routes", /array_agg\(DISTINCT COALESCE\(db\.load_id, sl\.load_id\)\)/g, (match, offset, text) => offset === text.lastIndexOf(match) ? "array_agg(NULL)" : match],
    ["general mapper", "routes", /load_ids:\s*Array\.isArray\(row\.load_ids\)/, "load_ids: false"],
    ["driver mapper", "routes", /load_ids:\s*Array\.isArray\(row\.load_ids\)/g, (match, offset, text) => offset === text.lastIndexOf(match) ? "load_ids: false" : match],
    ["general human producer", "routes", /jsonb_agg\(jsonb_build_object\('id', linked\.load_id::text, 'label', l\.load_number\)/, "jsonb_agg(jsonb_build_object('id', linked.load_id::text, 'label', NULL)"],
    ["driver human producer", "routes", /jsonb_agg\(jsonb_build_object\('id', linked\.load_id::text, 'label', l\.load_number\)/g, (match, offset, text) => offset === text.lastIndexOf(match) ? "jsonb_agg(jsonb_build_object('id', linked.load_id::text, 'label', NULL)" : match],
    ["general human mapper", "routes", /load_links:\s*Array\.isArray\(row\.load_links\)/, "load_links: false"],
    ["driver human mapper", "routes", /load_links:\s*Array\.isArray\(row\.load_links\)/g, (match, offset, text) => offset === text.lastIndexOf(match) ? "load_links: false" : match],
    ["pre-settlements panel", "panel", /entityLabel\(link\.label, link\.id, "Load"\)/, 'entityLabel(null, link.id, "Load")'],
    ["settlements table", "table", /entityLabel\(link\.label, link\.id, "Load"\)/, 'entityLabel(null, link.id, "Load")'],
    ["API type", "api", /load_ids\?:\s*string\[\]/, "load_count?: number"],
    ["human API type", "api", /load_links\?:\s*Array<\{ id: string; label: string \}>/, "load_links?: never"],
  ];
  const escaped = [];
  for (const [name, key, pattern, replacement] of mutations) {
    const planted = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (planted[key] === source[key] || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-settlements-load-ids-reverse-link SELFTEST FAILED: escaped ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-settlements-load-ids-reverse-link selftest PASS — ${mutations.length}/${mutations.length} independent plants rejected`);
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-settlements-load-ids-reverse-link: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-settlements-load-ids-reverse-link: OK — both settlement list queries return real load ids alongside the count; PreSettlementsPanel and SettlementsTable drill kind=load"
);
