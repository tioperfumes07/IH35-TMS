#!/usr/bin/env node
/**
 * FACTORING-REQUIRED-LIABILITY-INFLATION — Factoring KPI/settings/import chrome must not
 * claim scoreboard `liability` (driver_liabilities / money liability objects) when the
 * surface is FactoringHome tabs / Faro import / factors admin with no liability write path.
 *
 * ACCT-F5306 (2026-08-15): this guard's MUST_KEEP was itself stale — it demanded
 * `home.reserve_tracker` keep `liability`, but a same-day, fully evidenced honesty audit
 * (LINK-F5187 cluster A, PR #6976, `factoring.required.json` honesty_audit
 * `liability_2026_08_15_cluster_a`) already correctly DROPPED liability from
 * home.reserve_tracker (and 5 sibling leaves — submit.queue, batches.create/detail,
 * accounting.submit, reserves.dashboard): verified live that neither ReserveTracker.tsx nor
 * ReserveDashboard.tsx contains any `EntityLink kind="liability"` (only `kind="factor"`/
 * `kind="factoring_advance"`); both are reserve-balance ROLLUP views across many movements,
 * not a single owning liability record — the same false-required shape as the already-dropped
 * gl_je flags on cash-flow rollups (PR #6936). A sibling guard
 * (verify-liability-surfaces-built.mjs, LINK-F5187-CLUSTER-A-CORRECTION) already removed the
 * identical stale MUST_KEEP for these same leaves; this guard was the one instance of that
 * drift left uncorrected. Removed reserve_tracker from MUST_KEEP to match the shipped,
 * evidenced decision — this is following an existing honesty_audit, not re-litigating it.
 *
 * Usage: node scripts/verify-factoring-required-liability-honest.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-required-liability-honest";

const FORBIDDEN = {
  factoring: {
    "home.summary": ["liability"],
    "home.statements_settings": ["liability"],
    "home.faro_imports": ["liability"],
    "home.chargebacks_fees": ["liability", "expense"],
    "home.equipment_loans": ["liability", "ap_bill"],
    "factors.admin": ["liability"],
    "faro.import": ["liability"],
    // ACCT-F5306: honesty_audit liability_2026_08_15_cluster_a dropped liability from this
    // rollup view (see file header) — now guarded against re-inflation, not just tolerated.
    "home.reserve_tracker": ["liability"],
  },
  dispatch: {
    "docs.ocr": ["ap_bill", "expense", "gl_je"],
    "secondary.book_load": ["ap_bill"],
    "planning.reserve": ["ap_bill"],
  },
  vendors: {
    "detail.ap.vendor_credits": ["liability"],
  },
};

// ACCT-F5306: no factoring leaf currently owns an un-dropped liability Required cell — the
// former "home.reserve_tracker" KEEP was the stale side of an already-shipped honesty_audit
// drop (see file header). Left as an empty map (not deleted) so the checkKeep() machinery
// stays ready if a genuine factoring liability-owning leaf is built and Required later.
const MUST_KEEP = {};

function loadMod(mod) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${mod}.required.json`), "utf8"),
  );
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function checkForbidden(doc, leafCols, mod) {
  const out = [];
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  for (const [id, cols] of Object.entries(leafCols)) {
    const leaf = byId[id];
    if (!leaf) {
      out.push(`${mod} missing ${id}`);
      continue;
    }
    for (const c of cols) {
      if ((leaf.required || []).includes(c)) out.push(`${mod}.${id} must NOT require ${c}`);
    }
  }
  return out;
}

function checkKeep(doc, leafCols, mod) {
  const out = [];
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  for (const [id, cols] of Object.entries(leafCols)) {
    const leaf = byId[id];
    if (!leaf) {
      out.push(`${mod} missing KEEP ${id}`);
      continue;
    }
    for (const c of cols) {
      if (!(leaf.required || []).includes(c)) out.push(`${mod}.${id} must KEEP require ${c}`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const doc = loadMod("factoring");

  const clone = structuredClone(doc);
  const leaf = clone.leaves.find((l) => l.id === "home.summary");
  if (!leaf) fail("selftest: home.summary missing");
  leaf.required = [...(leaf.required || []), "liability"];
  const bad = checkForbidden(clone, FORBIDDEN.factoring, "factoring");
  if (!bad.length) fail("selftest poison missed");

  // ACCT-F5306: mutation-prove the specific regression this fix guards against — liability
  // re-inflating onto reserve_tracker after the honesty_audit correctly dropped it.
  const clone2 = structuredClone(doc);
  const rt = clone2.leaves.find((l) => l.id === "home.reserve_tracker");
  if (!rt) fail("selftest: home.reserve_tracker missing");
  rt.required = [...(rt.required || []), "liability"];
  const bad2 = checkForbidden(clone2, FORBIDDEN.factoring, "factoring");
  if (!bad2.some((f) => f.includes("home.reserve_tracker"))) fail("selftest: reserve_tracker re-inflation poison missed");

  console.log(`${LABEL} --selftest PASS (2 planted regressions caught: ${bad.length} + reserve_tracker re-inflation)`);
  process.exit(0);
}

const failures = [];
for (const [mod, leafCols] of Object.entries(FORBIDDEN)) {
  failures.push(...checkForbidden(loadMod(mod), leafCols, mod));
}
for (const [mod, leafCols] of Object.entries(MUST_KEEP)) {
  failures.push(...checkKeep(loadMod(mod), leafCols, mod));
}

const home = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/factoring/FactoringHome.tsx"), "utf8");
if (/driver_liabilit|kind=["']liability["']/.test(home)) {
  failures.push("FactoringHome now has liability drill — re-scope FORBIDDEN home.* leaves");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — factoring home/admin/reserve_tracker liability chrome DROPs held (no false-required inflation)`);
