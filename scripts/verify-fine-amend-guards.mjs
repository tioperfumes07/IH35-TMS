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
 * 443.113 AJK-12 (2026-10-12) held /dismiss to the same block; LEAD 443.114 (same day) RULED the other way for
 * dismissal: a fine dismissed (e.g. in court) must clear the driver charge in ONE action. /dismiss on a converted fine
 * therefore calls the ONE liability void engine (voidDriverLiabilityInClientTx — voids the pending deduction, reverses
 * the receivable, refuses when any of it was already recovered) INSIDE its transaction and BEFORE the dismiss UPDATE,
 * and the DB lock (migration 202615820910) allows converted -> dismissed only once that liability is voided.
 * /reduce keeps the Option B block.

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
const readOpt = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } };
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

  // LEAD 443.114 (AJK-12 ruling): dismissing a converted fine clears the driver charge in ONE action — inside the one
  // withCompanyScope transaction it calls the ONE liability void engine (voidDriverLiabilityInClientTx) BEFORE the
  // dismiss UPDATE, and surfaces the engine's "already recovered" refusal by name.
  const dismiss = routeBody(code, "dismiss");
  if (dismiss) {
    const txStart = dismiss.indexOf("withCompanyScope(");
    const voidAt = dismiss.indexOf("voidDriverLiabilityInClientTx(");
    const updateAt = dismiss.search(/UPDATE safety\.civil_fines[\s\S]*?SET status = 'dismissed'/);
    if (voidAt === -1) {
      problems.push(`${FILE} /dismiss: does not void the converted driver liability through voidDriverLiabilityInClientTx (443.114).`);
    } else {
      if (txStart === -1 || voidAt < txStart) {
        problems.push(`${FILE} /dismiss: the liability void runs outside the dismissal transaction (443.114: one action).`);
      }
      if (updateAt !== -1 && voidAt > updateAt) {
        problems.push(`${FILE} /dismiss: the fine is marked dismissed BEFORE its liability is voided (443.114: void THEN dismiss).`);
      }
    }
    const update = /UPDATE safety\.civil_fines[\s\S]*?RETURNING \*/.exec(dismiss)?.[0] ?? "";
    if (!/converted_to_liability_id IS NOT DISTINCT FROM/.test(update)) {
      problems.push(`${FILE} /dismiss: the UPDATE does not re-check the converted pointer it voided (race with a concurrent convert).`);
    }
    if (!/driver_receivable_partly_recovered/.test(dismiss)) {
      problems.push(`${FILE} /dismiss: the void engine's "already recovered" refusal is not surfaced by name.`);
    }
  }
  // The liability void route and the dismissal share ONE engine.
  const liabRoutes = readOpt("apps/backend/src/liabilities/liabilities.routes.ts");
  if (liabRoutes !== null && !/voidDriverLiabilityInClientTx\(/.test(stripComments(liabRoutes))) {
    problems.push(`apps/backend/src/liabilities/liabilities.routes.ts: PATCH /liabilities/:id/void no longer calls voidDriverLiabilityInClientTx (one engine).`);
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

  // Case 4 (443.114): /dismiss dismisses without voiding the liability.
  expectCaught(
    "dismiss-without-void",
    inRoute("dismiss", /const voided = await voidDriverLiabilityInClientTx\(/, "const voided = await noopVoid("),
    "/dismiss: does not void the converted driver liability"
  );

  // Case 5 (443.114): /dismiss voids the liability but marks the fine dismissed FIRST (void after dismiss).
  {
    const start = live.indexOf('app.post("/api/v1/safety/fines/:id/dismiss"');
    const rest = live.slice(start + 10);
    const end = start + 10 + rest.search(/app\.(post|get|patch|put|delete)\(/);
    const body = live.slice(start, end);
    const voidCall = /\n\s*const voided = await voidDriverLiabilityInClientTx\([\s\S]*?\}\);\n/.exec(body)?.[0] ?? "";
    const swapped = voidCall
      ? body.replace(voidCall, "\n").replace(/(RETURNING \*\n\s*`,\n[^\n]*\n\s*\);\n)/, `$1${voidCall}`)
      : body;
    expectCaught("dismiss-void-after-dismiss", live.slice(0, start) + swapped + live.slice(end), "BEFORE its liability is voided");
  }

  // Case 6 (443.114): the liability void runs outside the dismissal transaction.
  expectCaught(
    "dismiss-void-outside-txn",
    inRoute("dismiss", /const outcome = await withCompanyScope\(/, "await voidDriverLiabilityInClientTx(pool, {});\n    const outcome = await withCompanyScope("),
    "outside the dismissal transaction"
  );

  // Case 7 (443.114): the void engine's recovered refusal is swallowed.
  expectCaught(
    "dismiss-recovered-refusal-dropped",
    inRoute("dismiss", /driver_receivable_partly_recovered/g, "conflict"),
    "\"already recovered\" refusal is not surfaced"
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
  console.log(`${LABEL} SELFTEST PASS — 7 planted defects caught, live source clean`);
  process.exit(0);
}

const problems = assertFineAmendGuards();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — fines cannot be amended out from under a driver liability or after voiding`);
