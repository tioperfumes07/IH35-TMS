#!/usr/bin/env node
/**
 * MATRIX-INFINITE-PENDING-FEED (live-caught, 2026-08-20): the Program > Module Matrix's three raw
 * `fetch()` calls (fetchMatrixRecentMerged, fetchModuleMatrix in ModuleMatrixPreviewPage.tsx;
 * fetchSystemMatrix in ModuleMatrixSystemView.tsx) had no client-side timeout. React Query's
 * retry/error handling (and the page's own `showUnavailableBanner = isFetched && (!liveOk ||
 * isError)` logic) only runs once a query's promise REJECTS — a hung backend connection leaves a
 * bare `fetch()` promise permanently unsettled, so the board sat on "PENDING FEED" forever with
 * zero indication anything was wrong, live-reproduced against the deployed backend's chronic
 * intermittent-hang pattern this session (auth/me, org/me/companies repeatedly stalling past
 * 10-12s before either resolving or 503ing). This mirrors an already-fixed sibling bug,
 * LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING (apps/frontend/src/api/mdata.ts
 * getDriver), which uses the same AbortSignal.timeout pattern this guard locks.
 *
 * FAIL: any of the three fetch() calls is missing a `signal: AbortSignal.timeout(<ms>)` option.
 * PASS: all three carry it, so a hung connection always resolves to a real rejection instead of
 * an unbounded pending state.
 *
 * Self-test: node scripts/verify-matrix-fetch-timeout.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-matrix-fetch-timeout";
const PREVIEW = "apps/frontend/src/pages/program/ModuleMatrixPreviewPage.tsx";
const SYSTEM_VIEW = "apps/frontend/src/pages/program/ModuleMatrixSystemView.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

// Each entry: [file, function name to scope the search to, expected fetch() call substring]
const SITES = [
  {
    file: PREVIEW,
    fn: "fetchMatrixRecentMerged",
    anchor: 'fetch(resolveApiUrl("/api/v1/program/audit-scoreboard"), {',
  },
  {
    file: PREVIEW,
    fn: "fetchModuleMatrix",
    anchor: "fetch(\n    resolveApiUrl(`/api/v1/program/module-matrix?module=${moduleId}`),",
  },
  {
    file: SYSTEM_VIEW,
    fn: "fetchSystemMatrix",
    anchor: 'fetch(resolveApiUrl("/api/v1/program/module-matrix?scope=system"), {',
  },
];

function functionBody(source, fnName) {
  const start = source.indexOf(`async function ${fnName}(`);
  assert(start !== -1, `${fnName}: function not found`);
  // Scope to roughly the next 900 chars — plenty to cover a leading root-cause comment plus the
  // fetch() call and its options object, without needing a real brace-matching parser here.
  return source.slice(start, start + 900);
}

function failures(sources) {
  const out = [];
  for (const { file, fn, anchor } of SITES) {
    const body = functionBody(sources[file], fn);
    if (!body.includes(anchor)) {
      out.push(`${fn} (${file}): fetch() call anchor not found — file shape changed, re-check this guard`);
      continue;
    }
    if (!/signal:\s*AbortSignal\.timeout\(\d+/.test(body)) {
      out.push(`${fn} (${file}): fetch() call is missing signal: AbortSignal.timeout(<ms>) — a hung connection will never settle`);
    }
  }
  return out;
}

const live = { [PREVIEW]: fs.readFileSync(PREVIEW, "utf8"), [SYSTEM_VIEW]: fs.readFileSync(SYSTEM_VIEW, "utf8") };

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = SITES.map(({ file, fn }) => ({
    name: `${fn} loses its timeout`,
    file,
    mutate: (text) => text.replace(/,?\s*signal:\s*AbortSignal\.timeout\(\d+_?\d*\)/, ""),
  }));
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) { escaped.push(`${name}: mutation anchor missing`); continue; }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — all 3 Module Matrix fetch() calls carry a client-side AbortSignal.timeout`);
