#!/usr/bin/env node
// B-B DEPLOY-PARITY MONITOR (live, network) — the frontend is a SEPARATE Render static deploy that can lag the
// backend / main; a stale frontend was previously invisible (2026-07-15 "fixed in main but old shows live").
// Fetches the SERVED frontend sha (/version.json), the SERVED backend sha (/api/v1/healthz/shallow), and the
// expected main sha; RED if frontend != backend OR either != main. Prints a component|sha|matches-main table.
//
// Modes:
//   --self-test                 run the pure compare-logic fixtures (no network) — always safe in CI.
//   DEPLOY_PARITY_LIVE=1         run the live fetch+compare (post-deploy / scheduled monitor).
//   (neither)                   SKIP with exit 0 so the static verify:* glob never fails on a no-network run.
// Env: FRONTEND_URL (default https://app.ih35dispatch.com), BACKEND_URL (default https://api.ih35dispatch.com),
//   EXPECTED_MAIN_SHA (7-char; else derived from `git rev-parse --short=7 origin/main`, else main-check skipped).
import { execSync } from "node:child_process";

const short = (s) => String(s || "").trim().slice(0, 7);

/**
 * Pure parity decision. main may be null/"" (unknown) → only frontend-vs-backend is asserted.
 * @returns {{ ok:boolean, rows:Array<{component:string,sha:string,matchesMain:string}>, reasons:string[] }}
 */
export function compareParity({ frontend, backend, main }) {
  const fe = short(frontend), be = short(backend), mn = short(main);
  const reasons = [];
  if (!fe) reasons.push("frontend sha unavailable (/version.json missing or unreadable)");
  if (!be) reasons.push("backend sha unavailable (/api/v1/healthz version missing)");
  if (fe && be && fe !== be) reasons.push(`frontend (${fe}) != backend (${be}) — a component is lagging`);
  if (mn) {
    if (fe && fe !== mn) reasons.push(`frontend (${fe}) != main (${mn}) — frontend deploy is stale`);
    if (be && be !== mn) reasons.push(`backend (${be}) != main (${mn}) — backend deploy is stale`);
  }
  const mark = (sha) => (!mn ? "?" : sha && sha === mn ? "yes" : "NO");
  const rows = [
    { component: "frontend", sha: fe || "(none)", matchesMain: mark(fe) },
    { component: "backend", sha: be || "(none)", matchesMain: mark(be) },
    { component: "main", sha: mn || "(unknown)", matchesMain: mn ? "yes" : "?" },
  ];
  return { ok: reasons.length === 0, rows, reasons };
}

function printTable(rows) {
  console.log("\ncomponent | sha      | matches-main");
  console.log("----------+----------+-------------");
  for (const r of rows) console.log(`${r.component.padEnd(9)} | ${String(r.sha).padEnd(8)} | ${r.matchesMain}`);
}

async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

function selfTest() {
  const cases = [
    { name: "all aligned -> ok", in: { frontend: "abc1234", backend: "abc1234", main: "abc1234" }, want: true },
    { name: "frontend stale -> fail", in: { frontend: "old0000", backend: "abc1234", main: "abc1234" }, want: false },
    { name: "backend stale -> fail", in: { frontend: "abc1234", backend: "old0000", main: "abc1234" }, want: false },
    { name: "fe==be but both != main -> fail", in: { frontend: "abc1234", backend: "abc1234", main: "new9999" }, want: false },
    { name: "no main, fe==be -> ok", in: { frontend: "abc1234", backend: "abc1234", main: "" }, want: true },
    { name: "no main, fe!=be -> fail", in: { frontend: "abc1234", backend: "def5678", main: "" }, want: false },
    { name: "frontend missing -> fail", in: { frontend: "", backend: "abc1234", main: "abc1234" }, want: false },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = compareParity(c.in).ok === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}`);
  }
  if (failed) { console.error(`\nself-test FAILED: ${failed}/${cases.length}`); process.exit(1); }
  console.log(`\nself-test PASS: ${cases.length}/${cases.length}`);
}

async function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  if (process.env.DEPLOY_PARITY_LIVE !== "1") {
    console.log("SKIP verify-deploy-parity: set DEPLOY_PARITY_LIVE=1 to run the live monitor (post-deploy/scheduled). Pure logic covered by --self-test.");
    return; // exit 0 — never fails the static verify:* glob on a no-network run
  }
  selfTest();
  const feUrl = (process.env.FRONTEND_URL || "https://app.ih35dispatch.com").replace(/\/$/, "");
  const beUrl = (process.env.BACKEND_URL || "https://api.ih35dispatch.com").replace(/\/$/, "");
  let mainSha = process.env.EXPECTED_MAIN_SHA || "";
  if (!mainSha) { try { mainSha = execSync("git rev-parse --short=7 origin/main", { encoding: "utf8" }); } catch { /* main-check skipped */ } }

  const feJson = await fetchJson(`${feUrl}/version.json`);
  const beJson = await fetchJson(`${beUrl}/api/v1/healthz/shallow`);
  const result = compareParity({ frontend: feJson?.version, backend: beJson?.version, main: mainSha });

  console.log(`\n=== DEPLOY-PARITY (${new Date().toISOString()}) ===`);
  console.log(`frontend: ${feUrl}/version.json   backend: ${beUrl}/api/v1/healthz/shallow`);
  printTable(result.rows);
  if (!result.ok) {
    console.error("\nFAIL deploy-parity:");
    result.reasons.forEach((r) => console.error(`  • ${r}`));
    // Monitor wiring (.github/workflows/deploy-parity-monitor.yml) surfaces this failing run; extend to
    // Sentry + the System health panel when the paging hook is added (tracked follow-up).
    process.exit(1);
  }
  console.log("\nPASS deploy-parity — frontend, backend, and main are all on the same sha.");
}

main();
