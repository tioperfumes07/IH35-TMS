#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["picker_law"],"leafRe":"^secondary\\.assignments$","task":"DISPATCH-F-QUICKSAVE-ASSIGN-500-CHROME-LAW"}
 *
 * Item 9 (picker law, Save->reload): every inline row-level Unit/Trailer/Driver assignment on the
 * Dispatch load board 500'd — quicksave.service.ts's reassignUnit/reassignTrailer/reassignDriver
 * pass assignment_method values ("inline_quicksave_unit"/"_trailer"/"_driver") that were never added
 * to dispatch.load_assignment_history's CHECK constraint (migration 0159's fixed list). Live-
 * reproduced 2026-08-21 via a direct fetch() replay of PATCH .../assign-unit on 2 real production
 * loads: Postgres 23514 check-constraint violation both times. Fixed by extending the constraint
 * (migration 202612941300, additive, same DROP+ADD pattern 0159 already used).
 *
 * Static guard: confirms every string literal quicksave.service.ts passes as `method:` is present in
 * the fix migration's CHECK constraint list, so a future new inline_quicksave_* method can't silently
 * reintroduce this exact class of bug.
 */
import fs from "node:fs";
const LABEL = "verify-quicksave-assignment-method-check-constraint";
const SERVICE_FILE = "apps/backend/src/dispatch/assignments/quicksave.service.ts";
const MIGRATION_FILE = "db/migrations/202612941300_dispatch_quicksave_assignment_method_check_extend.sql";

function audit(serviceSrc, migrationSrc) {
  const failures = [];
  const methodValues = [...serviceSrc.matchAll(/method:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  if (methodValues.length === 0) {
    failures.push("could not find any method: \"...\" literals in quicksave.service.ts");
    return failures;
  }
  const constraintBlock = migrationSrc.match(/CHECK \(assignment_method IN \(([\s\S]*?)\)\)/)?.[1] ?? "";
  const allowed = [...constraintBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  if (allowed.length === 0) {
    failures.push("could not find the CHECK (assignment_method IN (...)) list in the fix migration");
    return failures;
  }
  for (const value of methodValues) {
    if (!allowed.includes(value)) {
      failures.push(`quicksave.service.ts writes assignment_method "${value}" but the CHECK constraint does not permit it`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const serviceSrc = fs.readFileSync(SERVICE_FILE, "utf8");
  const migrationSrc = fs.readFileSync(MIGRATION_FILE, "utf8");
  const mutations = [
    ["drop-inline-unit-from-constraint", (m) => m.replace("'inline_quicksave_unit', ", "")],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(migrationSrc);
    if (candidate === migrationSrc || audit(serviceSrc, candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(SERVICE_FILE, "utf8"), fs.readFileSync(MIGRATION_FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — every quicksave.service.ts assignment_method literal is permitted by the CHECK constraint`);
