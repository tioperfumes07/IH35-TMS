#!/usr/bin/env node
/**
 * CC-3 queue 2b / 6 (2026-10-02): every write of mdata.loads.status is compare-and-set — the UPDATE only lands while the
 * status is still the one the writer read and validated (`AND status ...` in the same statement). Without it a GPS ping,
 * the driver app, bulk and an office drag can overwrite one another's newer decision. Static scan of every SQL template
 * in apps/backend/src that UPDATEs mdata.loads and sets status. Shrink-only baseline for writers not yet converted.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_load_status_writers_cas(); }
async function selftest_verify_load_status_writers_cas() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_load_status_writers_cas", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}
const BASELINE = JSON.parse(readFileSync("scripts/verify-load-status-writers-cas.baseline.json", "utf8"));
const files = execFileSync("git", ["grep", "-l", "UPDATE mdata.loads", "--", "apps/backend/src", ":!*.test.ts"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const offenders = [];
for (const f of files) {
  // Comments are not SQL: drop block and line comments (keeping line count) so a quoted UPDATE in prose never counts.
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const m of src.matchAll(/`([^`]*UPDATE mdata\.loads[^`]*)`/g)) {
    const sql = m[1];
    const setPart = (sql.match(/\bSET\b([\s\S]*?)(\bWHERE\b|$)/i) ?? [])[1] ?? "";
    // A dynamic SET (`SET ${parts.join(", ")}`) writes status when the same file pushes it in with add("status", ...).
    // Scoped to the 200 lines before the template (the handler that builds it), not the whole file.
    const before = src.slice(0, m.index).split("\n").slice(-200).join("\n");
    const dynamicStatus = /\$\{/.test(setPart) && /\badd\(\s*["']status["']/.test(before);
    if (!dynamicStatus && !/(^|[\s,])status\s*=/.test(setPart)) continue;
    const where = (sql.match(/\bWHERE\b([\s\S]*)/i) ?? [])[1] ?? "";
    if (/\b(l\.)?status(::text)?\s*(=|IN\b|<>|!=)/i.test(where)) continue;
    // ...and its compare-and-set is the interpolated predicate built beside it (`${statusCas}` = AND status::text = ...).
    if (dynamicStatus && /\$\{statusCas\}/.test(where) && /statusCas\s*=[^;]*status(::text)?\s*=/.test(src)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    offenders.push(`${f}:${line}`);
  }
}
const allowed = new Set(BASELINE.offenders);
const fresh = offenders.filter((o) => !allowed.has(o.replace(/:\d+$/, "")) );
console.log(`load-status writers without compare-and-set: ${offenders.length} (baseline files ${BASELINE.offenders.length})`);
for (const o of offenders) console.log("  " + o);
const files_now = new Set(offenders.map((o) => o.replace(/:\d+$/, "")));
if (fresh.length) { console.error("verify-load-status-writers-cas: FAIL — new status writer(s) without compare-and-set:\n  " + fresh.join("\n  ")); process.exit(1); }
const stale = BASELINE.offenders.filter((f) => !files_now.has(f));
if (stale.length) { console.error("verify-load-status-writers-cas: FAIL — baseline lists file(s) that are now clean; shrink the baseline: " + stale.join(", ")); process.exit(1); }
console.log("verify-load-status-writers-cas: OK");
