#!/usr/bin/env node
/**
 * LEAD 443.219 G-ERR (runtime audit 10-21, class 5 "silent error swallowing"): a failure is never shown as a success.
 *   RULE 1 (backend) — a route handler's `catch` never answers 2xx with an empty list (`send({ x: [] })`, `send([])`):
 *     /api/v1/notifications returned 200 { notifications: [] } on any SQL error (notifications/list.routes.ts).
 *   RULE 2 (backend) — the notification stream's cursor keeps the row's EXACT timestamp + id (a JS Date truncates to ms, so
 *     the last row was re-sent every 5 s — notifications/stream.routes.ts).
 *   RULE 3 (backend) — recomputeDebtSync never returns null on failure (the list showed stale debt with no signal and the
 *     lock path proceeded) — driver-finance/settlements.routes.ts.
 *   RULE 4 (frontend) — Load Costs KPI tiles read "—" while loading / failing (they showed $0); Vendor Balances bills pane
 *     has an error state (it said "No bills for this vendor").
 * Static (no database). --selftest plants each regression. Baseline: the catch-empty-list scan is shrink-only over files
 * that already did it before this guard (listed by name below — each is debt, never new rot).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LABEL = "verify-no-silent-error-success";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  list: "apps/backend/src/notifications/list.routes.ts",
  stream: "apps/backend/src/notifications/stream.routes.ts",
  settlements: "apps/backend/src/driver-finance/settlements.routes.ts",
  loadCosts: "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx",
  vendorBalances: "apps/frontend/src/pages/accounting/VendorBalancesPage.tsx",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Every `catch (...) { ... }` block in a route file that answers 2xx with an empty list. */
export function catchEmptyListSites(src) {
  const out = [];
  const re = /catch\s*(\([^)]*\))?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1, i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; }
    const body = src.slice(re.lastIndex, i);
    const emptySend = /reply\s*(?:\.code\(\s*2\d\d\s*\))?\s*\.send\(\s*(?:\[\s*\]|\{[^{}]*:\s*\[\s*\][^{}]*\})\s*\)/.test(body);
    if (emptySend) out.push(src.slice(0, m.index).split("\n").length);
  }
  return out;
}

function routeFiles() {
  const out = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(path.join(ROOT, d))) {
      const rel = `${d}/${n}`;
      if (n === "node_modules" || n === "__tests__" || n.startsWith(".")) continue;
      if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.routes\.ts$/.test(n)) out.push(rel);
    }
  };
  walk("apps/backend/src");
  return out;
}

export function check(src = {}, files = null, baseline = BASELINE) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  // RULE 1 — over every route file (the named list route must be clean; others only shrink).
  const all = files ?? routeFiles().map((rel) => [rel, read(rel)]);
  for (const [rel, text] of all) {
    const sites = catchEmptyListSites(rel === F.list ? s.list : text);
    const allowed = baseline[rel] ?? 0;
    if (sites.length > allowed) p.push(`RULE 1 ${rel}: a catch answers 2xx with an empty list (lines ${sites.join(", ")}) — a failure must be an error status, never "no rows"`);
  }
  if (catchEmptyListSites(s.list).length) p.push(`RULE 1 ${F.list}: the notifications list answers a SQL error with 200 []`);
  // RULE 2
  if (!/created_at::text AS cursor_at/.test(s.stream) || !/\(created_at, id\) > \(\$2::timestamptz, \$3::uuid\)/.test(s.stream))
    p.push(`RULE 2 ${F.stream}: the stream cursor is not the exact timestamp + id — the last notification is re-sent every poll`);
  // RULE 3
  const fn = s.settlements.slice(s.settlements.indexOf("async function recomputeDebtSync("), s.settlements.indexOf("export function debtRecomputeError("));
  if (!fn || /return null;/.test(fn) || !/recompute_failed: true as const/.test(fn)) p.push(`RULE 3 ${F.settlements}: recomputeDebtSync swallows its failure`);
  if (!/if \(debtRecomputeError\(debt\)\) return \{ blocked: true as const, reason: "debt_recompute_failed" \};/.test(s.settlements))
    p.push(`RULE 3 ${F.settlements}: the lock proceeds on a failed debt recompute`);
  // RULE 4
  if (!/const tilesUnknown = !query\.data;/.test(s.loadCosts) || (s.loadCosts.match(/tilesUnknown \? "—"/g) ?? []).length < 5)
    p.push(`RULE 4 ${F.loadCosts}: KPI tiles show a number while the board is loading / failed`);
  if (!/billsQuery\.isError \?/.test(s.vendorBalances) || !/!billsQuery\.isError && \(billsQuery\.data\?\.rows \?\? \[\]\)\.length === 0/.test(s.vendorBalances))
    p.push(`RULE 4 ${F.vendorBalances}: a failed bills request reads "No bills for this vendor"`);
  return p;
}

// Pre-existing catch → 2xx empty-list route files (debt, shrink-only). Measured 2026-10-22 after this fix: none.
export const BASELINE = {};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--scan")) {
  for (const rel of routeFiles()) { const s = catchEmptyListSites(read(rel)); if (s.length) console.log(`${rel}: ${s.join(", ")}`); }
  process.exit(0);
}
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const files = routeFiles().map((rel) => [rel, read(rel)]);
  const b0 = check(base, files);
  if (b0.length) { console.error(`SELFTEST FAIL: baseline not clean`, b0); process.exit(1); }
  const plants = [
    ["list swallows into 200 []", { list: base.list.replace('return reply.code(500).send({ error: "notifications_list_failed" });', "return reply.send({ notifications: [] });") }],
    ["stream back to a ms cursor", { stream: base.stream.replace("(created_at, id) > ($2::timestamptz, $3::uuid)", "created_at > $2::timestamptz") }],
    ["debt recompute swallows", { settlements: base.settlements.replace("return { recompute_failed: true as const, error: message };", "return null;") }],
    ["lock ignores recompute failure", { settlements: base.settlements.replace('if (debtRecomputeError(debt)) return { blocked: true as const, reason: "debt_recompute_failed" };', "") }],
    ["tiles back to 0", { loadCosts: base.loadCosts.replaceAll('tilesUnknown ? "—" : ', "") }],
    ["vendor bills error reads empty", { vendorBalances: base.vendorBalances.replace("!billsQuery.isError && (billsQuery.data", "(billsQuery.data") }],
  ];
  for (const [n, plant] of plants) {
    const k = Object.keys(plant)[0];
    if (plant[k] === base[k]) { console.error(`SELFTEST FAIL: plant "${n}" did not apply`); process.exit(1); }
    if (!check({ ...base, ...plant }, files).length) { console.error(`SELFTEST FAIL: plant "${n}" not caught`); process.exit(1); }
  }
  if (!catchEmptyListSites("try { x() } catch (e) { return reply.send({ rows: [] }); }").length) { console.error("SELFTEST FAIL: scanner misses send({ rows: [] })"); process.exit(1); }
  if (catchEmptyListSites("try { x() } catch (e) { return reply.code(500).send({ error: 'x' }); }").length) { console.error("SELFTEST FAIL: scanner flags a 500"); process.exit(1); }
  console.log(`${LABEL} --selftest PASS (${plants.length + 2}/${plants.length + 2})`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) { console.error(`${LABEL}: FAIL —\n  ${p.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — no catch answers 2xx with an empty list (beyond the shrink-only baseline); stream cursor exact; debt recompute failure named; Load Costs tiles "—" while loading/failing; vendor bills error state`);
}
