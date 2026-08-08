#!/usr/bin/env node
/**
 * GUARD: the driver list default page must cover a full entity roster. ACCT-F209.
 *
 * THE DEFECT. The list defaulted to LIMIT 50 with ORDER BY created_at DESC, so it returned the 50
 * NEWEST drivers and silently dropped the rest. Measured on prod for USMCA: 89 listable rows, 50
 * returned, and of the 27 genuinely ACTIVE drivers only 17 fell inside the window —
 * 10 REAL, ACTIVE DRIVERS WERE UNREACHABLE in the Book Load picker.
 *
 * WHY IT BLOCKED ASSIGN INSTEAD OF MERELY PAGINATING. Newest-first means the drivers hidden were the
 * LONGEST-TENURED — the opposite of who a dispatcher usually wants. Combined with a search that could
 * not match a full name (ACCT-F203), there was NO route to those drivers at all: not by scrolling, not
 * by typing. The two defects covered for each other, which is why fixing either one alone still left
 * drivers unassignable, and why this guard and the ACCT-F203 guard both have to hold.
 *
 * WHAT IS ASSERTED, and what deliberately is NOT. The default must be at least ROSTER_FLOOR and the
 * maximum at least as large as the default. This does not pin exact numbers: rosters grow, and a guard
 * that demands one magic value would be edited to whatever the code says the day it fails. It pins the
 * PROPERTY that made drivers unreachable — a default page smaller than a real roster.
 *
 * Run:  node scripts/verify-driver-list-cap-covers-roster.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/mdata/drivers.routes.ts";
const LABEL = "verify-driver-list-cap-covers-roster";

/** Live rosters on prod 2026-08-08: TRANSP 89 listable, USMCA 89 listable. 200 leaves real headroom. */
export const ROSTER_FLOOR = 200;

export function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Parse the limit field of the driver listQuerySchema: its .max(N) and .default(N). */
export function parseLimitBounds(src) {
  const clean = stripComments(src);
  const m = /limit:\s*z\.coerce\.number\(\)[^\n]*?\.default\(\s*(\d+)\s*\)/.exec(clean);
  if (!m) return null;
  const line = m[0];
  const max = /\.max\(\s*(\d+)\s*\)/.exec(line);
  return { def: Number(m[1]), max: max ? Number(max[1]) : null };
}

export function collectProblems(src, file = TARGET) {
  const bounds = parseLimitBounds(src);
  if (!bounds) {
    return [
      `${file}: could not find the driver list limit default. If the schema moved, move this guard ` +
        `with it — an unparsed schema must not read as a pass (ACCT-F209).`,
    ];
  }
  const problems = [];
  if (bounds.def < ROSTER_FLOOR) {
    problems.push(
      `${file}: the driver list default page is ${bounds.def}, below the ${ROSTER_FLOOR}-row roster ` +
        `floor. With ORDER BY created_at DESC this returns only the newest ${bounds.def} drivers and ` +
        `silently drops the rest — on prod that hid 10 of USMCA's 27 active drivers from the Book ` +
        `Load picker, making them unassignable (ACCT-F209).`
    );
  }
  if (bounds.max !== null && bounds.max < bounds.def) {
    problems.push(
      `${file}: the limit maximum (${bounds.max}) is below its own default (${bounds.def}), so the ` +
        `default is unreachable and every request would be clamped down (ACCT-F209).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = "limit: z.coerce.number().int().min(1).max(200).default(50),";
  if (collectProblems(bad).length !== 1) failures.push("the ACCT-F209 default of 50 was NOT caught");

  const good = "limit: z.coerce.number().int().min(1).max(1000).default(250),";
  if (collectProblems(good).length !== 0) failures.push("the corrected bounds were flagged");

  const atFloor = "limit: z.coerce.number().int().min(1).max(1000).default(200),";
  if (collectProblems(atFloor).length !== 0) failures.push("a default exactly at the floor was flagged");

  // max below default is its own defect and must be reported.
  const inverted = "limit: z.coerce.number().int().min(1).max(100).default(250),";
  if (!collectProblems(inverted).some((p) => /maximum/.test(p))) {
    failures.push("a maximum below the default was NOT caught");
  }

  // An unparsable schema must FAIL, never silently pass.
  if (collectProblems("const x = 1;").length !== 1) {
    failures.push("an unparsed schema read as a pass — a guard that cannot see must not say OK");
  }

  // A comment showing the old value must not trip it.
  if (collectProblems("// was .default(50)\n" + good).length !== 0) {
    failures.push("a COMMENT quoting the old default tripped the guard — false red");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (default 50 caught, fix passes, floor boundary passes, inverted max ` +
      `caught, unparsable schema fails closed, comment cannot fake a red)`
  );
  process.exit(0);
}

const abs = path.join(root, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${TARGET} is missing; the driver list cap cannot be verified.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
const b = parseLimitBounds(fs.readFileSync(abs, "utf8"));
console.log(
  `${LABEL} OK — driver list default ${b.def} (max ${b.max}) covers a full entity roster; no active ` +
    `driver is dropped from the picker by the page size.`
);
