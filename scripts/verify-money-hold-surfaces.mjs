#!/usr/bin/env node
/**
 * INSTRUMENT: is a CLS-MONEY-HOLD instance a genuine OWNER HOLD, or a WIRING DEFECT wearing one?
 * ACCT-F281.
 *
 * WHY THIS EXISTS: CLS-MONEY-HOLD carries three instances and one status. Nobody could say what its
 * red MEANT, in either direction — "blocked on the owner" and "we never built the button" look
 * identical from a row count, and both produce an empty table. A wave card that cannot distinguish
 * them cannot be drained or trusted.
 *
 * THE DISCRIMINATOR, and it is one question: CAN A HUMAN ACTUALLY CAUSE THIS ROW TO EXIST?
 *   surface reachable from the UI  -> the owner can act and has not     -> GENUINE HOLD    (wait)
 *   no frontend caller at all      -> the owner CANNOT act              -> WIRING DEFECT   (build)
 * A hold is something we wait on; a defect is something we fix. Recording one as the other is how
 * HOLD-001 sat for 13 days behind a button that does not exist, with its posting flag ON the whole
 * time.
 *
 * SCOPE IS DELIBERATELY NARROW — three named endpoints, not a sweep. A bulk "which endpoints have no
 * frontend caller" scan over-reports badly, because the FE composes URLs from variables
 * (`${basePath}/x`, `apiRequest(withCompany(path))`), so a literal grep counts wired endpoints as
 * orphans. I measured that once (201 of 396, ~51%) and discarded the number as unsound. These three
 * strings are distinctive, non-composed, and each was verified by hand.
 *
 * THIS INSTRUMENT REPORTS. IT DOES NOT FAIL THE BUILD on a genuine hold — waiting on an owner is not
 * a defect, and a guard that reddens on correct expected state is the anti-pattern this board has
 * been fighting all night. It exits non-zero ONLY when a surface claimed as a hold turns out to have
 * no way to exercise it, i.e. when the card is lying about what it is.
 *
 * Run:  node scripts/verify-money-hold-surfaces.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-hold-surfaces";
const FE_ROOTS = ["apps/frontend/src", "apps/driver-pwa/src"];

/**
 * One entry per CLS-MONEY-HOLD instance. `needle` must be a literal the FE would have to write out —
 * never a fragment the FE could compose from a variable, or this instrument lies.
 */
export const HOLD_SURFACES = [
  {
    id: "HOLD-001",
    what: "settlement GL pay-run",
    endpoint: "POST /api/v1/accounting/settlement-posting/bill-payment-post",
    needle: "bill-payment-post",
    note: "poster + endpoint exist and SETTLEMENT_GL_POSTING_ENABLED is ON for all 3 entities since 2026-07-26",
  },
  {
    id: "HOLD-002",
    what: "factoring reserve movement",
    endpoint: "GET/POST /api/v1/factoring/batches/:id/reserve-movements",
    needle: "reserve-movements",
    note: "factor agreement exists; 0 reserve movements recorded",
  },
  {
    id: "HOLD-003",
    what: "insurance claims",
    endpoint: "/api/v1/insurance/claims",
    needle: "insurance/claims",
    note: "claim table unpopulated; fault/economics undecided by owner",
  },
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

/** Frontend files that reference `needle`. Test files excluded — a test caller is not a user surface. */
export function frontendCallers(needle, files) {
  const hits = [];
  for (const f of files) {
    let src;
    try {
      src = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (src.includes(needle)) hits.push(f);
  }
  return hits;
}

export function classify(surface, callers) {
  return callers.length > 0
    ? { ...surface, verdict: "GENUINE-HOLD", callers: callers.length }
    : { ...surface, verdict: "WIRING-DEFECT", callers: 0 };
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const s = HOLD_SURFACES[0];
  if (classify(s, ["a.tsx"]).verdict !== "GENUINE-HOLD") failures.push("a reachable surface was not called a hold");
  if (classify(s, []).verdict !== "WIRING-DEFECT") failures.push("an unreachable surface was not called a defect");
  // The needles must be literals a frontend has to spell out. A needle containing an interpolation
  // marker would make this instrument report orphans that are actually wired.
  for (const x of HOLD_SURFACES) {
    if (/\$\{|\+ *['"`]/.test(x.needle)) failures.push(`${x.id}: needle is composable — instrument would lie`);
    if (x.needle.length < 8) failures.push(`${x.id}: needle too short to be distinctive`);
  }
  if (HOLD_SURFACES.length !== 3) failures.push("surface list drifted from CLS-MONEY-HOLD's 3 instances");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 6/6 (both verdicts, 3 needles literal + distinctive, denominator fixed at 3)`);
  process.exit(0);
}

const feFiles = FE_ROOTS.flatMap((r) => walk(path.join(root, r)));
const results = HOLD_SURFACES.map((s) => classify(s, frontendCallers(s.needle, feFiles)));

console.log(`${LABEL} — ${results.length} CLS-MONEY-HOLD surface(s), ${feFiles.length} frontend file(s) scanned`);
for (const r of results) {
  console.log(`  ${r.verdict === "GENUINE-HOLD" ? "HOLD  " : "DEFECT"} ${r.id}  ${r.what}`);
  console.log(`         ${r.endpoint}`);
  console.log(`         frontend callers: ${r.callers}  — ${r.note}`);
}

const defects = results.filter((r) => r.verdict === "WIRING-DEFECT");
if (defects.length) {
  console.error(
    `\n${LABEL} FAIL — ${defects.length} of ${results.length} surface(s) recorded as an OWNER HOLD have NO frontend ` +
      `caller. The owner cannot act on these, so they are WIRING DEFECTS mis-filed as holds:`
  );
  for (const d of defects) console.error(`  ✗ ${d.id} ${d.what} — ${d.endpoint} (0 callers)`);
  process.exit(1);
}
console.log(`\n${LABEL} OK — every money-hold surface is reachable; each red is a genuine owner decision.`);
