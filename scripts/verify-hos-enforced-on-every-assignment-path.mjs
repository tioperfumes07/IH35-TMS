#!/usr/bin/env node
/**
 * verify-hos-enforced-on-every-assignment-path (HOS-1, 49 CFR §395)
 *
 * THE DEFECT THIS PINS. Hours-of-service enforcement had DRIFTED ACROSS DISPATCH PATHS — the exact
 * failure the shared driver-qualification gate was created to end (G9-C1 did it for credentials and
 * left HOS un-unified). Verified live on br-fancy-credit-akjnd07a 2026-07-27:
 *
 *   hos.duty_status_events        484,004 rows across 76 drivers
 *   views.drivers_with_hos_status 165 rows, 7 drivers is_in_violation = true
 *                                 (5 sampled, all minutes_until_violation = 0 — already over, TRANSP)
 *
 * and the four assignment paths disagreed about what to do with them:
 *   book-load        hard 422 + audit + logged manager override        (correct)
 *   quick-assign     threw, BUT its HOS query ended `.catch(() => ({ rows: [] }))` — a FAILED query
 *                    returned "no violation" and the driver was assigned. Fail-OPEN on a federal rule.
 *   planner          NO HOS check at all
 *   quicksave        NO HOS check at all
 * So the same driver, the same day, could be blocked or dispatched depending on which button the
 * dispatcher pressed. That is indefensible in a DOT audit or a personal-injury deposition.
 *
 * THE FIX THIS LOCKS. HOS is now a reason on the SHARED gate (assertDriverQualifiedForLoad), which all
 * four paths already call — so enforcement cannot drift between entry points again, and it is
 * FAIL-CLOSED: a direct query with no `.catch()` swallow, whose error propagates and aborts the
 * caller's transaction rather than being downgraded to "no violation". A safety gate that fails open
 * is worse than no gate, because it leaves a record implying the check was performed.
 *
 * NOT ASSERTED: that a driver with no row in the HOS view is blocked. No duty data is "unknown", not
 * "clear" — it is not a violation on its own, and blocking on it would ground every driver who has
 * never logged duty. Surfacing unknown-duty drivers belongs to the HOS module.
 *
 * Usage: node scripts/verify-hos-enforced-on-every-assignment-path.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const GATE = "apps/backend/src/dispatch/driver-qualification.service.ts";
/** Every path that assigns a driver to a load MUST route through the shared gate. */
const ASSIGNMENT_PATHS = [
  "apps/backend/src/dispatch/book-load.service.ts",
  "apps/backend/src/dispatch/quick-assign.service.ts",
  "apps/backend/src/dispatch/planner.service.ts",
  "apps/backend/src/dispatch/assignments/quicksave.service.ts",
];

export function strip(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The gate itself must read HOS, fail closed, and expose it as a block reason. */
export function gateProblems(src) {
  const out = [];
  if (!/drivers_with_hos_status/.test(src)) {
    out.push("the shared gate does not read views.drivers_with_hos_status — HOS is not enforced centrally");
  }
  if (!/"hos_violation"/.test(src)) {
    out.push('the shared gate has no "hos_violation" block reason — a violation cannot be reported to callers');
  }
  // Fail-closed: the HOS read must not be wrapped in a swallowing catch.
  if (/drivers_with_hos_status[\s\S]{0,400}?\.catch\(/.test(src)) {
    out.push("the gate's HOS query is wrapped in a .catch() — a failed query would be downgraded to 'no violation' (fail-OPEN)");
  }
  return out;
}

/** Every assignment path must call the shared gate. */
export function pathProblems(file, src) {
  return /assertDriverQualifiedForLoad\s*\(/.test(src)
    ? []
    : [`${file} assigns a driver but never calls assertDriverQualifiedForLoad — it bypasses HOS, CDL, medical, hazmat, D&A and Clearinghouse enforcement`];
}

function read(p) {
  const abs = resolve(process.cwd(), p);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${p} not found — if it moved, update this guard rather than deleting the check`);
    process.exit(1);
  }
  return strip(readFileSync(abs, "utf8"));
}

function run() {
  const problems = [...gateProblems(read(GATE))];
  for (const f of ASSIGNMENT_PATHS) problems.push(...pathProblems(f, read(f)));
  if (problems.length) {
    console.error(`[verify-hos-enforced-on-every-assignment-path] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(`[verify-hos-enforced-on-every-assignment-path] OK — HOS enforced fail-closed in the shared gate; all ${ASSIGNMENT_PATHS.length} assignment paths route through it`);
  return true;
}

function selftest() {
  let ok = true;
  const gate = read(GATE);

  if (gateProblems(gate).length) {
    console.error("SELFTEST FAIL: the real (fixed) gate is flagged — false positive");
    ok = false;
  } else {
    console.log("SELFTEST: corrected gate not flagged — OK");
  }

  const cases = [
    ["no HOS view read", gate.replace(/drivers_with_hos_status/g, "some_other_view")],
    ["no hos_violation reason", gate.replace(/"hos_violation"/g, '"other_reason"')],
    ["HOS read wrapped in a swallowing catch", gate.replace(
      /FROM views\.drivers_with_hos_status/,
      "FROM views.drivers_with_hos_status`).catch(() => ({ rows: [] })); const x = (`"
    )],
  ];
  for (const [name, mutated] of cases) {
    if (mutated === gate) {
      console.error(`SELFTEST FAIL: mutation '${name}' was INERT — it proves nothing`);
      ok = false;
      continue;
    }
    if (!gateProblems(mutated).length) {
      console.error(`SELFTEST FAIL: '${name}' was NOT caught`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' correctly caught`);
    }
  }

  // A path that drops the gate call must fail.
  if (pathProblems("x.ts", "const a = 1;").length === 0) {
    console.error("SELFTEST FAIL: a path with no gate call was accepted");
    ok = false;
  } else {
    console.log("SELFTEST: a path that bypasses the shared gate is correctly caught");
  }

  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
