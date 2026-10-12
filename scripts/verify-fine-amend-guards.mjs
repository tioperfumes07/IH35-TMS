#!/usr/bin/env node
/**
 * GUARD: a civil fine cannot be amended out from under its dependent records.
 *
 * WHY THIS EXISTS (2026-07-23, owner ruling Option B)
 * `POST /api/v1/safety/fines/:id/reduce` updated `amount_cents` with NO guard on
 * `converted_to_liability_id` and no `voided_at` guard. `convertFineToLiability` COPIES
 * `fine.amount_cents` into `driver_finance.driver_liabilities`; the rows are not linked afterwards.
 *
 * So reducing an already-converted fine left the driver's liability at the ORIGINAL amount. Worked
 * example: a $1,000 ticket converted to a driver liability, then reduced to $400 by the court, still
 * deducted $1,000 from the driver's settlement while the fine read "reduced". A silent $600
 * overcharge against a real person, with nothing on screen to reveal it.
 *
 * OWNER RULING (Option B): BLOCK the amend while a dependent liability exists — do not cascade.
 * This matches accounting practice in the systems we benchmark against: QuickBooks refuses in-place
 * edits of payment-bearing transactions and requires the dependent to be unapplied first; NetSuite
 * dims fields on transactions that carry dependents. A silent cascade would reach into a driver's
 * debt without anyone looking at it.
 *
 * 443.113 AJK-12 (2026-10-12): /dismiss is held to the SAME block. Conversion also books a posted driver
 * receivable and a pending settlement deduction; dismissing only the fine leaves the driver owing a dismissed
 * fine (the database lock E_FINE_LOCKED_AFTER_CONVERSION made it a raw 500 with no remedy). /dismiss must
 * refuse a converted fine by name (fine_already_converted_to_liability + driver_liability_id) and carry
 * `converted_to_liability_id IS NULL` in its UPDATE.
 *
 * Also enforced: contest/dismiss/reduce must refuse VOIDED fines. void-not-delete means a voided row
 * is immutable history; editing it is never correct.
 *
 * The predicate must appear in the UPDATE itself, not only in a pre-check SELECT — otherwise a
 * concurrent convert between the read and the write slips straight through.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/safety/fines.routes.ts";
const LABEL = "verify-fine-amend-guards";
const SELFTEST = process.argv.includes("--selftest");

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Body of one route handler, from its app.post(...) to the next app.<verb>( at the same level. */
function routeBody(code, route) {
  const start = code.indexOf(`app.post("/api/v1/safety/fines/:id/${route}"`);
  if (start === -1) return null;
  const rest = code.slice(start + 10);
  const nextIdx = rest.search(/app\.(post|get|patch|put|delete)\(/);
  return nextIdx === -1 ? code.slice(start) : code.slice(start, start + 10 + nextIdx);
}

export function assertFineAmendGuards(source) {
  const code = stripComments(source ?? read());
  const problems = [];

  const reduce = routeBody(code, "reduce");
  if (!reduce) {
    problems.push(`${FILE}: the /reduce route was not found`);
  } else {
    // The money guard: the UPDATE itself must refuse a converted fine.
    const update = /UPDATE safety\.civil_fines[\s\S]*?RETURNING \*/.exec(reduce)?.[0] ?? "";
    if (!/converted_to_liability_id IS NULL/.test(update)) {
      problems.push(
        `${FILE} /reduce: the UPDATE does not carry \`converted_to_liability_id IS NULL\`. Reducing a ` +
          `fine already converted to a driver liability leaves that liability at the ORIGINAL amount, ` +
          `so the driver is deducted the full amount while the fine reads "reduced" (owner ruling: BLOCK).`
      );
    }
    if (!/voided_at IS NULL/.test(update)) {
      problems.push(`${FILE} /reduce: the UPDATE does not carry \`voided_at IS NULL\` — a voided fine is immutable.`);
    }
    // A refusal must name the dependent record and the remedy, not just fail.
    if (!/fine_already_converted_to_liability/.test(reduce)) {
      problems.push(
        `${FILE} /reduce: no \`fine_already_converted_to_liability\` response — the caller must be told ` +
          `WHY it was refused and which liability blocks it.`
      );
    }
    if (!/driver_liability_id/.test(reduce)) {
      problems.push(`${FILE} /reduce: the refusal does not return driver_liability_id (the record to reverse first).`);
    }
  }

  const dismiss = routeBody(code, "dismiss");
  if (dismiss) {
    const update = /UPDATE safety\.civil_fines[\s\S]*?RETURNING \*/.exec(dismiss)?.[0] ?? "";
    if (!/converted_to_liability_id IS NULL/.test(update)) {
      problems.push(
        `${FILE} /dismiss: the UPDATE does not carry \`converted_to_liability_id IS NULL\` — dismissing a fine ` +
          `converted to a driver liability leaves the driver owing a dismissed fine (443.113 AJK-12).`
      );
    }
    if (!/fine_already_converted_to_liability/.test(dismiss)) {
      problems.push(`${FILE} /dismiss: no \`fine_already_converted_to_liability\` refusal for a converted fine (443.113 AJK-12).`);
    }
    if (!/driver_liability_id/.test(dismiss)) {
      problems.push(`${FILE} /dismiss: the converted-fine refusal does not return driver_liability_id (the record to void).`);
    }
  }

  for (const route of ["contest", "dismiss"]) {
    const body = routeBody(code, route);
    if (!body) {
      problems.push(`${FILE}: the /${route} route was not found`);
      continue;
    }
    const update = /UPDATE safety\.civil_fines[\s\S]*?RETURNING \*/.exec(body)?.[0] ?? "";
    if (!/voided_at IS NULL/.test(update)) {
      problems.push(
        `${FILE} /${route}: the UPDATE does not carry \`voided_at IS NULL\` — a voided fine must not be ${route}ed.`
      );
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = read();
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (mutated === live) {
      failures.push(`${name}: mutation did not change the source — inert case`);
      return;
    }
    const problems = assertFineAmendGuards(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(
        `${name}: planted defect NOT caught (expected "${needle}", got: ${
          problems.length ? problems.join(" | ") : "no problems"
        })`
      );
    }
  };

  /** Apply a replacement inside ONE route's handler only, so a case cannot be satisfied by another route. */
  const inRoute = (route, from, to) => {
    const start = live.indexOf(`app.post("/api/v1/safety/fines/:id/${route}"`);
    const rest = live.slice(start + 10);
    const next = rest.search(/app\.(post|get|patch|put|delete)\(/);
    const end = next === -1 ? live.length : start + 10 + next;
    return live.slice(0, start) + live.slice(start, end).replace(from, to) + live.slice(end);
  };

  // Case 1: the converted-liability predicate is dropped from the /reduce UPDATE (the money defect).
  expectCaught(
    "converted-guard-removed",
    inRoute("reduce", /\n\s*AND converted_to_liability_id IS NULL/, ""),
    "/reduce: the UPDATE does not carry `converted_to_liability_id IS NULL`"
  );

  // Case 2: the refusal stops naming the blocking liability.
  expectCaught(
    "remedy-not-named",
    inRoute("reduce", /driver_liability_id: outcome\.liabilityId,\n/, ""),
    "/reduce: the refusal does not return driver_liability_id"
  );

  // Case 4 (AJK-12): /dismiss loses its converted-liability predicate.
  expectCaught(
    "dismiss-converted-guard-removed",
    inRoute("dismiss", /\n\s*AND converted_to_liability_id IS NULL/, ""),
    "/dismiss: the UPDATE does not carry `converted_to_liability_id IS NULL`"
  );

  // Case 5 (AJK-12): /dismiss stops refusing a converted fine by name.
  expectCaught(
    "dismiss-refusal-removed",
    inRoute("dismiss", /fine_already_converted_to_liability/g, "conflict"),
    "/dismiss: no `fine_already_converted_to_liability` refusal"
  );

  // Case 6 (AJK-12): /dismiss's refusal stops naming the liability to void.
  expectCaught(
    "dismiss-remedy-not-named",
    inRoute("dismiss", /driver_liability_id: outcome\.liabilityId,\n/, ""),
    "/dismiss: the converted-fine refusal does not return driver_liability_id"
  );

  // Case 3: contest loses its voided guard.
  expectCaught(
    "contest-void-guard-removed",
    live.replace(
      // The live predicate is "operating_company_id = $2::uuid" (typed bind) — the fixture must match it or the case is inert.
      "SET status = 'contested',\n              notes = COALESCE($3, notes),\n              updated_by_user_id = $4\n          WHERE id = $1\n            AND operating_company_id = $2::uuid\n            AND voided_at IS NULL",
      "SET status = 'contested',\n              notes = COALESCE($3, notes),\n              updated_by_user_id = $4\n          WHERE id = $1\n            AND operating_company_id = $2::uuid"
    ),
    "/contest: the UPDATE does not carry"
  );

  const liveProblems = assertFineAmendGuards(live);
  if (liveProblems.length) failures.push(`live source FAILS: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 planted defects caught, live source clean`);
  process.exit(0);
}

const problems = assertFineAmendGuards();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — fines cannot be amended out from under a driver liability or after voiding`);
