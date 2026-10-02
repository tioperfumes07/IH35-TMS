#!/usr/bin/env node
// OWNER LAW 2026-10-02 — competing-engine audit (docs/bus 00-OWNER-LAW-2026-10-02-BUILD-ONLY-COMPETING-ENGINE-AUDIT.md).
// ONE factoring purchase engine: apps/backend/src/factoring/purchase.service.ts (createPurchaseDraft / postPurchase /
// voidPurchase), driven from Factoring -> Submit to Factor. Fails if a second writer of the same concern becomes live:
//   1. only purchase.service.ts funds an advance (postFactoringAdvanceEvent*) outside the poster itself — the legacy
//      "Mark Advanced" route and the Faro CSV commit must stay behind LEGACY_FACTORING_WRITERS_RETIRED;
//   2. only purchase.service.ts inserts accounting.factoring_advances — the legacy create route stays retired and the
//      delivery auto-submit stays an early-return no-op;
//   3. submitBatch (the batch engine) is reachable only through retired routes;
//   4. a reserve release posts only from Banking (the /release route stays retired);
//   5. the advance void runs through voidPurchase;
//   6. the UI sends every "Submit to Factor" to the canonical tab;
//   7. one reserve READER: nothing reads factoring.v_factor_reserve_balance, and the reserve balance / history /
//      forecast (reserve.service.ts) and the factor list (factor.service.ts) read the factoring KPI engine.
// Static, <1s. --selftest plants each regression and proves it fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-factoring-purchase-engine";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = "LEGACY_FACTORING_WRITERS_RETIRED) return sendRetiredFactoringWriter";
const CANONICAL = "apps/backend/src/factoring/purchase.service.ts";
const POSTER = "apps/backend/src/accounting/factoring-posting/poster.service.ts";

/** The gate must sit between the route's registration and the first call inside that handler. */
function gatedBefore(src, routeMarker, callMarker) {
  const r = src.indexOf(routeMarker);
  if (r < 0) return { ok: false, why: `route ${routeMarker} not found` };
  const c = src.indexOf(callMarker, r);
  const g = src.indexOf(GATE, r);
  if (g < 0 || (c >= 0 && g > c)) return { ok: false, why: `${routeMarker} reaches ${callMarker} without the retirement gate` };
  return { ok: true };
}

export function check(files) {
  const problems = [];
  const code = (rel) => files[rel] ?? "";
  const backend = Object.keys(files).filter((f) => f.startsWith("apps/backend/src/") && !/\.test\.ts$|__tests__/.test(f));

  // 1. funding posts
  for (const f of backend) {
    if (f === POSTER || f === CANONICAL) continue;
    if (/\bpostFactoringAdvanceEvent(InClientTx)?\(/.test(code(f)) && !["apps/backend/src/accounting/factoring-advances.routes.ts", "apps/backend/src/factoring/faro-csv-import.ts"].includes(f)) {
      problems.push(`${f}: funds a factoring advance outside the purchase engine`);
    }
  }
  const adv = code("apps/backend/src/accounting/factoring-advances.routes.ts");
  for (const [route, call] of [
    ['"/api/v1/accounting/factoring-advances", ', "INSERT INTO accounting.factoring_advances"],
    ['"/api/v1/accounting/factoring-advances/:id/advance"', "postFactoringAdvanceEvent("],
    ['"/api/v1/accounting/factoring-advances/:id/release"', "postFactoringReleaseEvent("],
  ]) {
    const r = gatedBefore(adv, route, call);
    if (!r.ok) problems.push(`factoring-advances.routes.ts: ${r.why}`);
  }
  const csvRoute = code("apps/backend/src/factoring/faro-csv-import.routes.ts");
  if (/commitFaroCsvImport\(/.test(csvRoute)) {
    const g = csvRoute.indexOf(GATE);
    if (g < 0 || g > csvRoute.indexOf("commitFaroCsvImport({")) problems.push("faro-csv-import.routes.ts: the Faro CSV commit is reachable");
  }
  for (const f of backend) {
    if (f !== "apps/backend/src/factoring/faro-csv-import.routes.ts" && f !== "apps/backend/src/factoring/faro-csv-import.ts" && /\bcommitFaroCsvImport\(/.test(code(f))) {
      problems.push(`${f}: calls commitFaroCsvImport`);
    }
  }

  // 2. advance inserts
  for (const f of backend) {
    if (!/INSERT INTO accounting\.factoring_advances\b/.test(code(f))) continue;
    if (f === CANONICAL || f === "apps/backend/src/accounting/factoring-advances.routes.ts") continue;
    if (f === "apps/backend/src/factoring/auto-submit-on-delivery.service.ts" && /if \(FACTORING_PURCHASE_IS_OWNER_ONLY\) return/.test(code(f))) continue;
    problems.push(`${f}: inserts accounting.factoring_advances outside the purchase engine`);
  }

  // 3. batch engine
  const batchRoutes = {
    "apps/backend/src/factoring/batch.routes.ts": '"/api/v1/factoring/batches/:id/submit"',
    "apps/backend/src/factoring/submission-queue.routes.ts": '"/api/v1/factoring/submission-queue/submit-batch"',
  };
  for (const [f, route] of Object.entries(batchRoutes)) {
    const r = gatedBefore(code(f), route, "submitBatch(");
    if (!r.ok) problems.push(`${path.basename(f)}: ${r.why}`);
  }
  for (const f of backend) {
    if (batchRoutes[f] || f === "apps/backend/src/factoring/batch.service.ts") continue;
    if (/\bsubmitBatch\(/.test(code(f))) problems.push(`${f}: calls submitBatch (batch engine)`);
  }

  // 5. void delegates
  const v = adv.indexOf('"/api/v1/accounting/factoring-advances/:id/void"');
  if (v < 0 || adv.indexOf("voidPurchase(", v) < 0 || adv.indexOf("voidPurchase(", v) > adv.indexOf("reverseFactoringAdvanceEvent(", v)) {
    problems.push("factoring-advances.routes.ts: /:id/void does not delegate to voidPurchase before any direct reversal");
  }

  // 7. reserve readers
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s--[^\n]*/g, "");
  for (const f of backend) {
    if (/v_factor_reserve_balance/.test(strip(code(f)))) problems.push(`${f}: reads factoring.v_factor_reserve_balance (second reserve engine)`);
  }
  const rs = code("apps/backend/src/factoring/reserve.service.ts");
  for (const fn of ["getFactorReserveBalances", "getReserveBalanceHistory", "forecastReserveReleases"]) {
    const i = rs.indexOf(`export async function ${fn}(`);
    const body = i < 0 ? "" : rs.slice(i, rs.indexOf("\nexport ", i + 10) > 0 ? rs.indexOf("\nexport ", i + 10) : undefined);
    if (!/factoringReservePostings|factoringBookReserveCents/.test(body) || /FROM factoring\.reserve_movement/.test(body)) {
      problems.push(`reserve.service.ts: ${fn} does not read the factoring KPI engine`);
    }
  }
  if (!/factoringBookReserveCents/.test(code("apps/backend/src/factoring/factor.service.ts"))) problems.push("factor.service.ts: the factor list reserve does not read the factoring KPI engine");

  // 6. UI
  const home = code("apps/frontend/src/pages/factoring/FactoringHome.tsx");
  if (/to="\/factoring\/submit"/.test(home)) problems.push("FactoringHome.tsx: Submit to Factor links to the retired batch queue");
  const manifest = code("apps/frontend/src/routes/manifest.tsx");
  for (const p of ["/factoring/submit", "/factoring/batches/new"]) {
    const i = manifest.indexOf(`path="${p}"`);
    if (i >= 0 && !manifest.slice(i, i + 300).includes('<Navigate to="/factoring/submit-invoice"')) problems.push(`manifest.tsx: ${p} still renders a second purchase screen`);
  }
  const tab = code("apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx");
  if (/\/api\/v1\/factoring\/batches/.test(tab)) problems.push("dispatch FactoringTab.tsx: creates or submits a factoring batch");
  return problems;
}

function load() {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); }
      else if (/\.(ts|tsx)$/.test(e.name)) out[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8");
    }
  };
  walk("apps/backend/src");
  for (const f of ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx"]) {
    out[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  const base = check(real);
  if (base.length) { console.error(`${LABEL} --selftest FAIL: the real tree is not clean (${base[0]})`); process.exit(1); }
  const plant = (file, from, to) => ({ ...real, [file]: real[file].replace(from, to) });
  const adv = "apps/backend/src/accounting/factoring-advances.routes.ts";
  const cases = [
    ["un-gated Mark Advanced", plant(adv, /if \(LEGACY_FACTORING_WRITERS_RETIRED\) return sendRetiredFactoringWriter\(reply, "POST \/api\/v1\/accounting\/factoring-advances\/:id\/advance[^;]*;/, "")],
    ["new funding caller", { ...real, "apps/backend/src/x/new.ts": "await postFactoringAdvanceEvent({})" }],
    ["new advance insert", { ...real, "apps/backend/src/x/new.ts": "INSERT INTO accounting.factoring_advances (id)" }],
    ["new batch caller", { ...real, "apps/backend/src/x/new.ts": "await submitBatch(id, oci)" }],
    ["header back to batch queue", plant("apps/frontend/src/pages/factoring/FactoringHome.tsx", "to={FACTORING_TAB_PATH.submit_invoice}", 'to="/factoring/submit"')],
    ["view reader back", { ...real, "apps/backend/src/x/new.ts": "await c.query(`SELECT balance_cents FROM factoring.v_factor_reserve_balance`)" }],
    ["drawer batch submit", { ...real, "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx": real["apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx"] + '\napiRequest("/api/v1/factoring/batches")' }],
  ];
  const missed = cases.filter(([, files]) => check(files).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length} plants caught; real tree clean`);
  process.exit(0);
}

const problems = check(load());
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} second-engine path(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — one factoring purchase engine (purchase.service.ts); legacy create / Mark Advanced / release / batch submit / Faro CSV commit retired; void delegates to voidPurchase; every Submit to Factor opens the canonical tab; reserve readers read the KPI engine`);
