#!/usr/bin/env node
/**
 * WIZ-44 follow-up / VOID-COLUMN LAW (2026-09-03): "selectable <=> deactivated_at IS NULL, never
 * status." Cursor closed this at apps/frontend/src/components/parity/entityPickerRegistry.ts (the
 * shared picker layer). This guard closes the SAME hole at the canonical API endpoint itself
 * (GET /api/v1/mdata/drivers) so a caller that reaches the route directly -- bypassing the
 * registry -- cannot reopen the merged-driver-still-selectable defect WIZ-44 just fixed.
 *
 * Locks TWO things in apps/backend/src/mdata/drivers.routes.ts:
 *   1. The list query's default filter set includes "deactivated_at IS NULL".
 *   2. That filter is skipped ONLY when the caller explicitly passes include_deactivated=true
 *      (the admin roster's opt-in, apps/frontend/src/pages/Drivers.tsx) -- never ambient.
 */
import fs from "node:fs";

const REL = "apps/backend/src/mdata/drivers.routes.ts";

export function run(root = process.cwd()) {
  const failures = [];
  let src;
  try {
    src = fs.readFileSync(`${root}/${REL}`, "utf8");
  } catch {
    return [`${REL}: missing`];
  }

  if (!/const filters: string\[\] = \[EXCLUDE_ARCHIVED_DRIVERS_SQL\];[\s\S]{0,120}if \(!include_deactivated\) \{[\s\S]{0,80}filters\.push\("deactivated_at IS NULL"\);/.test(src)) {
    failures.push(
      `${REL}: GET /api/v1/mdata/drivers no longer defaults to deactivated_at IS NULL -- a merged/deactivated driver would be selectable through this endpoint again, reopening WIZ-44's fixed hole at a lower layer`
    );
  }

  if (!/include_deactivated: z\.coerce\.boolean\(\)\.optional\(\)\.default\(false\)/.test(src)) {
    failures.push(`${REL}: include_deactivated must default to false -- it is an explicit admin opt-in, never ambient`);
  }

  return failures;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/driver-list-deactivated-guard-selftest-");
  const tmpFile = `${dir}/${REL}`;
  fs.mkdirSync(tmpFile.slice(0, tmpFile.lastIndexOf("/")), { recursive: true });

  const fixed = `
const listQuerySchema = z.object({
  include_deactivated: z.coerce.boolean().optional().default(false),
});

async function handler() {
  const filters: string[] = [EXCLUDE_ARCHIVED_DRIVERS_SQL];
  if (!include_deactivated) {
    filters.push("deactivated_at IS NULL");
  }
}
`;
  fs.writeFileSync(tmpFile, fixed);
  const passFailures = run(dir);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: drop the deactivated_at filter branch entirely (the exact regression).
  const broken1 = fixed.replace(
    `  if (!include_deactivated) {
    filters.push("deactivated_at IS NULL");
  }
`,
    ""
  );
  fs.writeFileSync(tmpFile, broken1);
  const f1 = run(dir);
  if (f1.length === 0) throw new Error("FAIL to catch: removing the deactivated_at IS NULL branch went undetected");

  // Mutation 2: flip the default to true (silently ambient instead of an explicit admin opt-in).
  const broken2 = fixed.replace(
    "include_deactivated: z.coerce.boolean().optional().default(false)",
    "include_deactivated: z.coerce.boolean().optional().default(true)"
  );
  fs.writeFileSync(tmpFile, broken2);
  const f2 = run(dir);
  if (f2.length === 0) throw new Error("FAIL to catch: flipping include_deactivated's default to true went undetected");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("verify-driver-list-excludes-deactivated SELFTEST PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-driver-list-excludes-deactivated FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-driver-list-excludes-deactivated OK — the canonical driver list defaults to excluding deactivated rows, admin roster opt-in unchanged");
