#!/usr/bin/env node
/**
 * FACTORING-REQUIRED-LIABILITY-INFLATION — Factoring KPI/settings/import chrome must not
 * claim scoreboard `liability` (driver_liabilities / money liability objects) when the
 * surface is FactoringHome tabs / Faro import / factors admin with no liability write path.
 *
 * KEEP liability on reserve_tracker / recourse / submit / batches / accounting advances
 * for the money lane to wire.
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

const MUST_KEEP = {
  factoring: {
    "home.reserve_tracker": ["liability"],
  },
};

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
  console.log(`${LABEL} --selftest PASS (poison would trip ${bad.length})`);
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
console.log(`${LABEL} PASS — factoring home/admin liability chrome DROPs held; reserve_tracker KEEP`);
