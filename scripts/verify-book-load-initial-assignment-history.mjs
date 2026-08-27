#!/usr/bin/env node
/**
 * HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS
 *
 * The Book Load full-form wizard's lockstep INSERT sets mdata.loads.assigned_primary_driver_id /
 * assigned_unit_id directly at creation time, but only ever wrote a dispatch.load_assignment_history
 * row for the TRAILER (gated on trailerIdForInsert) — never for the initial driver/unit assignment.
 * Every other assignment write path (quick-assign, quicksave, reassignment) writes a driver/unit
 * row, so load_assignment_history is the canonical assignment audit trail several consumers rely on
 * (the hop.assign Scenario Tracker probe's EXISTS clause among them). Live-confirmed on 3 real USMCA
 * loads with correctly rate-carded driver bills that the probe could never see for exactly this
 * reason (zero load_assignment_history rows for those load_ids at all). This guard locks the fix: a
 * second, independent INSERT records the initial driver/unit assignment whenever either is present.
 */
import fs from "node:fs";

const SERVICE_REL = "apps/backend/src/dispatch/book-load.service.ts";

export function run(root = process.cwd()) {
  const failures = [];
  let src;
  try {
    src = fs.readFileSync(`${root}/${SERVICE_REL}`, "utf8");
  } catch {
    return [`${SERVICE_REL}: missing`];
  }

  const trailerIdx = src.indexOf("if (trailerIdForInsert) {");
  if (trailerIdx < 0) {
    failures.push("could not locate the existing trailer-only load_assignment_history INSERT block — marker changed");
    return failures;
  }
  // Scope to the ~3500 chars after the trailer block — where the new driver/unit INSERT must live,
  // right after it, not scattered elsewhere in this 1800+-line file.
  const afterTrailer = src.slice(trailerIdx, trailerIdx + 3500);

  if (!/if \(load\.assigned_primary_driver_id \|\| load\.assigned_unit_id\)/.test(afterTrailer)) {
    failures.push("missing the initial-assignment guard `if (load.assigned_primary_driver_id || load.assigned_unit_id)` after the trailer INSERT block");
  }
  if (!/INSERT INTO dispatch\.load_assignment_history/.test(afterTrailer.slice(afterTrailer.indexOf("assigned_unit_id)")))) {
    failures.push("missing a SECOND INSERT INTO dispatch.load_assignment_history for the initial driver/unit assignment");
  }
  if (!/new_driver_id/.test(afterTrailer) || !/new_unit_id/.test(afterTrailer)) {
    failures.push("the new INSERT must carry new_driver_id and new_unit_id columns");
  }
  // Must read the load's OWN persisted (RETURNING *) fields, not the raw input — a team_id booking
  // deliberately leaves assigned_primary_driver_id NULL on the row itself; reading input.* here
  // would fabricate a driver_id the load was never actually assigned.
  if (!/load\.assigned_primary_driver_id \? String\(load\.assigned_primary_driver_id\) : null/.test(afterTrailer)) {
    failures.push("must read load.assigned_primary_driver_id (the persisted, post-INSERT value), not input.assigned_primary_driver_id — a team booking must not fabricate a driver_id");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-book-load-init-assign-");
  const dir = `${tmp}/apps/backend/src/dispatch`;
  fs.mkdirSync(dir, { recursive: true });

  const fixed = `
    if (trailerIdForInsert) {
      await client.query(
        \`INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, previous_trailer_id, new_trailer_id, assigned_by_user_id, warnings_acknowledged) VALUES ($1::uuid, $2::uuid, 'full_form', NULL, $3::uuid, $4::uuid, '[]'::jsonb)\`,
        [input.operating_company_id, String(load.id), trailerIdForInsert, input.requestingUserUuid]
      );
    }

    if (load.assigned_primary_driver_id || load.assigned_unit_id) {
      await client.query(
        \`INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, previous_driver_id, new_driver_id, previous_unit_id, new_unit_id, assigned_by_user_id, warnings_acknowledged) VALUES ($1::uuid, $2::uuid, 'full_form', NULL, $3::uuid, NULL, $4::uuid, $5::uuid, '[]'::jsonb)\`,
        [
          input.operating_company_id,
          String(load.id),
          load.assigned_primary_driver_id ? String(load.assigned_primary_driver_id) : null,
          load.assigned_unit_id ? String(load.assigned_unit_id) : null,
          input.requestingUserUuid,
        ]
      );
    }
`;
  fs.writeFileSync(`${dir}/book-load.service.ts`, fixed);
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: exact pre-fix pattern — no second INSERT at all (only the trailer one).
  const broken1 = fixed.replace(
    /\n\s*if \(load\.assigned_primary_driver_id[\s\S]*?\n\s*\}\n/,
    "\n"
  );
  fs.writeFileSync(`${dir}/book-load.service.ts`, broken1);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: missing initial-assignment INSERT went undetected");

  // Mutation 2: reads input.assigned_primary_driver_id instead of load.assigned_primary_driver_id
  // (would fabricate a driver_id for a team booking).
  const broken2 = fixed.replace(
    "load.assigned_primary_driver_id ? String(load.assigned_primary_driver_id) : null,",
    "input.assigned_primary_driver_id ? String(input.assigned_primary_driver_id) : null,"
  );
  fs.writeFileSync(`${dir}/book-load.service.ts`, broken2);
  const f2 = run(tmp);
  if (f2.length === 0) throw new Error("FAIL to catch: reading input.* instead of load.* went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-book-load-initial-assignment-history SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-book-load-initial-assignment-history FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-book-load-initial-assignment-history OK — initial driver/unit assignment is recorded in dispatch.load_assignment_history");
