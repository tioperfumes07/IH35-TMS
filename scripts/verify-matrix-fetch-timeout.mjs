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
    const timeoutMs = body.match(/AbortSignal\.timeout\((\d[\d_]*)\)/);
    if (timeoutMs) {
      const ms = Number(String(timeoutMs[1]).replace(/_/g, ""));
      if (fn === "fetchSystemMatrix" && (ms < 8_000 || ms > 20_000)) {
        out.push(`${fn}: system matrix timeout must be 8–20s (was ${ms}) — 60s looks like PENDING FEED`);
      }
    }
  }
  const system = sources[SYSTEM_VIEW];
  if (!/POLL_MS\s*=\s*300_000/.test(system)) {
    out.push("ModuleMatrixSystemView: POLL_MS must be 300_000 (5 min) — 30s polls abort scope=system before JSON");
  }
  if (!/staleTime:\s*300_000/.test(system)) {
    out.push("ModuleMatrixSystemView: useQuery staleTime must be 300_000 so the feed is not refetch-starved");
  }
  const svc = fs.readFileSync("apps/backend/src/program/module-matrix.service.ts", "utf8");
  if (!/moduleMatrixCache\s*=\s*new Map/.test(svc)) {
    out.push("module-matrix.service: per-module Map cache required (single-slot cache blew the system rollup)");
  }
  if (!/Promise\.all\(/.test(svc) || !/computeSystemModuleMatrix/.test(svc)) {
    out.push("module-matrix.service: system rollup must Promise.all modules + computeSystemModuleMatrix");
  }
  if (!/function buildSystemMatrixRequiredFallback/.test(system)) {
    out.push("ModuleMatrixSystemView: missing buildSystemMatrixRequiredFallback (API 502 must still paint Required)");
  }
  if (!/readClientLastGood/.test(system) || !/CLIENT_LAST_GOOD_KEY/.test(system)) {
    out.push("ModuleMatrixSystemView: sessionStorage last-good required so 502 does not wipe Built/Live");
  }
  if (!/placeholderData:\s*\(\)\s*=>\s*readClientLastGood\(\)\s*\?\?\s*buildSystemMatrixRequiredFallback\(\)/.test(system)) {
    out.push("ModuleMatrixSystemView: placeholderData must prefer session last-good then Required fallback");
  }
  if (!/ih35-system-matrix-last\.json/.test(svc) || !/readSystemLastGood/.test(svc)) {
    out.push("module-matrix.service: persist/read /tmp last-good so cold start is not GitHub-blocked zeros");
  }
  const ledgerFn = svc.slice(svc.indexOf("async function loadLedgerRows"), svc.indexOf("function loadGuardHits"));
  const diskIdx = ledgerFn.indexOf("existsSync(LEDGER_MD)");
  const ghIdx = ledgerFn.indexOf("loadOutboxTextFromGithub(LEDGER_REL)");
  if (diskIdx === -1 || ghIdx === -1 || diskIdx > ghIdx) {
    out.push("module-matrix.service: loadLedgerRows must read disk BEFORE GitHub (GitHub-first 502s healthz)");
  }
  const renderYaml = fs.readFileSync("render.yaml", "utf8");
  if (!renderYaml.includes("docs/bus/**")) {
    out.push("render.yaml: ignoredPaths must be docs/bus/** not all docs/** (scoreboard maps must ship)");
  }
  if (/- docs\/\*\*/.test(renderYaml)) {
    out.push("render.yaml: must not ignore docs/** (that forced GitHub-first matrix)");
  }
  return out;
}

const live = { [PREVIEW]: fs.readFileSync(PREVIEW, "utf8"), [SYSTEM_VIEW]: fs.readFileSync(SYSTEM_VIEW, "utf8") };

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ...SITES.map(({ file, fn }) => ({
      name: `${fn} loses its timeout`,
      file,
      mutate: (text) => text.replace(/,?\s*signal:\s*AbortSignal\.timeout\(\d+_?\d*\)/, ""),
    })),
    {
      name: "system poll back to 30s",
      file: SYSTEM_VIEW,
      mutate: (text) => text.replace("POLL_MS = 300_000", "POLL_MS = 30_000"),
    },
    {
      name: "last-good placeholder dropped",
      file: SYSTEM_VIEW,
      mutate: (text) =>
        text.replace(
          "placeholderData: () => readClientLastGood() ?? buildSystemMatrixRequiredFallback()",
          "placeholderData: buildSystemMatrixRequiredFallback",
        ),
    },
  ];
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
