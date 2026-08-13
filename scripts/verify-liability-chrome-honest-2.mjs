#!/usr/bin/env node
/**
 * LIABILITY-CHROME-HONEST-2 — DROP liability on factoring packet queue / vendor A/P chrome
 * with no driver_liabilities path; accounting reports hub is connectivity-only.
 * Tag banking driver_escrow as liability (escrow virtual bank).
 *
 * @matrix-built {"modules":["banking"],"cols":["liability"],"leafRe":"^driver_escrow$","task":"BANK-escrow-liability","vertical":"column-wave"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liability-chrome-honest-2";

const FORBIDDEN = {
  dispatch: { "queues.factoring_queue": ["liability"] },
  vendors: {
    "detail.ap": ["liability"],
    "detail.ap.record_bill_payment": ["liability"],
  },
  accounting: { reports: ["expense", "ap_bill", "gl_je"] },
};

const MUST_KEEP = {
  banking: { driver_escrow: ["liability"] },
};

function loadMod(mod) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${mod}.required.json`), "utf8"),
  );
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
      if (!(leaf.required || []).includes(c)) out.push(`${mod}.${id} must KEEP ${c}`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const clone = structuredClone(loadMod("vendors"));
  const leaf = clone.leaves.find((l) => l.id === "detail.ap");
  leaf.required = [...(leaf.required || []), "liability"];
  if (!checkForbidden(clone, FORBIDDEN.vendors, "vendors").length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  const accounting = structuredClone(loadMod("accounting"));
  accounting.leaves.find((l) => l.id === "reports").required.push("gl_je");
  if (!checkForbidden(accounting, FORBIDDEN.accounting, "accounting").some((failure) => failure.includes("gl_je"))) {
    console.error(`${LABEL} --selftest FAIL — stale reports gl_je mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = [];
for (const [mod, leafCols] of Object.entries(FORBIDDEN)) {
  failures.push(...checkForbidden(loadMod(mod), leafCols, mod));
}
for (const [mod, leafCols] of Object.entries(MUST_KEEP)) {
  failures.push(...checkKeep(loadMod(mod), leafCols, mod));
}

const fq = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx"),
  "utf8",
);
if (/driver_liabilit|kind=["']liability["']/.test(fq)) {
  failures.push("FactoringQueuePage has liability drill — remove queues.factoring_queue from FORBIDDEN");
}

const escrow = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx"),
  "utf8",
);
if (!/escrow/.test(escrow)) failures.push("DriverEscrowTabContent missing escrow surface");

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — liability chrome DROPs + connectivity-only reports hub + escrow liability tag`);
