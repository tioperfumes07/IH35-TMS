#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["loads","connectivity"],"leaves":["dispatch.load.charge_replacement.checked_writes"],"task":"DSP-MONEY-F7218A-EDIT-LOAD-CHARGE-REPLACEMENT-UNCHECKED-WRITES","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7218A-EDIT-LOAD-CHARGE-REPLACEMENT-UNCHECKED-WRITES (CC-1, 2026-08-29):
 * Edit Load's charge-replacement block (updateDispatchLoad, apps/backend/src/dispatch/update-load.
 * service.ts) used to deactivate every active dispatch.load_charge_lines row and insert the
 * replacement lines without checking either persisted identity set. A lost/RLS-filtered archive
 * (leaving a stale line `is_active = true` alongside the new set) or a lost replacement INSERT
 * could still fall through to the rate resync, audit, and HTTP 200 with silently incomplete
 * economics. Fixed by snapshot+locking the exact active set (SELECT ... FOR UPDATE) before
 * deactivating, requiring the deactivation UPDATE's RETURNING id count to match the locked
 * snapshot's count, and requiring every replacement INSERT to return its id -- any loss throws
 * and rolls back the whole edit transaction. This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-edit-load-charge-replacement-checked.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/update-load.service.ts",
};
const LABEL = "verify-edit-load-charge-replacement-checked";

export function audit(src) {
  const failures = [];
  const blockMatch = src.service.match(
    /add\("rate_total_cents", total\);[\s\S]*?\n  \}/,
  );
  if (!blockMatch) {
    failures.push(`${FILES.service}: the charge-replacement block was not found`);
    return failures;
  }
  const body = blockMatch[0];

  // 1. The active set must be snapshotted+locked before deactivation.
  if (!/SELECT id FROM dispatch\.load_charge_lines[\s\S]*FOR UPDATE/.test(body)) {
    failures.push(
      `${FILES.service}: the active charge-line set must be snapshotted with SELECT ... FOR UPDATE ` +
        `before deactivating -- without a lock+count, a lost archive can't be detected`,
    );
  }

  // 2. The deactivation UPDATE must RETURNING id and be compared against the snapshot count.
  const deactivateMatch = body.match(
    /UPDATE dispatch\.load_charge_lines SET is_active = false[\s\S]*?RETURNING id/,
  );
  if (!deactivateMatch) {
    failures.push(`${FILES.service}: the deactivation UPDATE must carry RETURNING id`);
  }
  if (!/if \(deactivated\.rows\.length !== activeChargeLines\.rows\.length\) \{\s*throw writeConflict\("E_LOAD_CHARGE_DEACTIVATE_INCOMPLETE"\);/.test(body)) {
    failures.push(
      `${FILES.service}: an incomplete deactivation (fewer rows affected than the locked snapshot) must throw`,
    );
  }

  // 3. Every replacement INSERT must RETURNING id and check the result.
  const insertMatch = body.match(/INSERT INTO dispatch\.load_charge_lines[\s\S]*?RETURNING id/);
  if (!insertMatch) {
    failures.push(`${FILES.service}: the replacement INSERT must carry RETURNING id`);
  }
  if (!/if \(!inserted\.rows\[0\]\?\.id\) \{\s*throw writeConflict\("E_LOAD_CHARGE_INSERT_FAILED"\);/.test(body)) {
    failures.push(`${FILES.service}: a lost replacement INSERT (no returned id) must throw`);
  }

  // 4. Ordering: the snapshot/lock must run before the deactivation UPDATE, which must run before
  //    any replacement INSERT.
  const snapshotIdx = body.indexOf("const activeChargeLines = await client.query");
  const deactivateIdx = body.indexOf("const deactivated = await client.query");
  const insertIdx = body.indexOf("const inserted = await client.query");
  if (snapshotIdx === -1 || deactivateIdx === -1 || insertIdx === -1 || !(snapshotIdx < deactivateIdx && deactivateIdx < insertIdx)) {
    failures.push(
      `${FILES.service}: snapshot+lock must run before deactivation, which must run before any replacement INSERT`,
    );
  }

  // 5. The two new error codes must be routed to a clean 409, not an unhandled 500 rethrow.
  const routesSrc = src.routes;
  if (!/E_LOAD_CHARGE_DEACTIVATE_INCOMPLETE.*E_LOAD_CHARGE_INSERT_FAILED|E_LOAD_CHARGE_INSERT_FAILED.*E_LOAD_CHARGE_DEACTIVATE_INCOMPLETE/.test(
    (routesSrc.match(/\[["'`]E_LOAD_WRITE_CONFLICT["'`][\s\S]*?\]\.includes/) ?? [""])[0],
  )) {
    failures.push(
      `apps/backend/src/dispatch/loads.routes.ts: both new charge-replacement error codes must be routed ` +
        `to the existing 409 conflict handler alongside E_LOAD_WRITE_CONFLICT`,
    );
  }

  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
    routes: fs.readFileSync(path.join(root, "apps/backend/src/dispatch/loads.routes.ts"), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }

  // Mutation 1: drop the snapshot+lock and deactivation-count check, reverting to the old
  // unchecked deactivate (the exact pre-fix shape).
  const droppedSnapshot = {
    service: good.service.replace(
      `    const activeChargeLines = await client.query<{ id: string }>(
      \`SELECT id FROM dispatch.load_charge_lines
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND is_active = true
        FOR UPDATE\`,
      [loadId, operatingCompanyId]
    );
    const deactivated = await client.query<{ id: string }>(
      \`UPDATE dispatch.load_charge_lines SET is_active = false, updated_at = now()
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND is_active = true
        RETURNING id\`,
      [loadId, operatingCompanyId]
    );
    if (deactivated.rows.length !== activeChargeLines.rows.length) {
      throw writeConflict("E_LOAD_CHARGE_DEACTIVATE_INCOMPLETE");
    }`,
      `    await client.query(
      \`UPDATE dispatch.load_charge_lines SET is_active = false, updated_at = now()
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND is_active = true\`,
      [loadId, operatingCompanyId]
    );`,
    ),
    routes: good.routes,
  };
  if (droppedSnapshot.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-snapshot pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedSnapshot).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped snapshot/deactivation-check regression escaped`);
    process.exit(1);
  }

  // Mutation 2: drop the INSERT result check, reverting to the old unchecked replacement INSERT
  // (the exact pre-fix shape).
  const droppedInsertCheck = {
    service: good.service
      .replace(
        `      const inserted = await client.query<{ id: string }>(
        \`INSERT INTO dispatch.load_charge_lines (
           operating_company_id, load_id, line_kind, additional_charge_id, charge_code,
           description, amount_cents, sort_order, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id\`,
        [operatingCompanyId, loadId, isSystem ? "system" : "accessorial", charge.additional_charge_id ?? null,
         charge.code, charge.description ?? null, charge.amount_cents, (index + 1) * 10, requestingUserUuid]
      );
      if (!inserted.rows[0]?.id) {
        throw writeConflict("E_LOAD_CHARGE_INSERT_FAILED");
      }`,
        `      await client.query(
        \`INSERT INTO dispatch.load_charge_lines (
           operating_company_id, load_id, line_kind, additional_charge_id, charge_code,
           description, amount_cents, sort_order, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)\`,
        [operatingCompanyId, loadId, isSystem ? "system" : "accessorial", charge.additional_charge_id ?? null,
         charge.code, charge.description ?? null, charge.amount_cents, (index + 1) * 10, requestingUserUuid]
      );`,
      ),
    routes: good.routes,
  };
  if (droppedInsertCheck.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-insert-check pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedInsertCheck).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped INSERT zero-row check regression escaped`);
    process.exit(1);
  }

  // Mutation 3: remove the new error codes from the route's 409 handler list (the exact pre-fix shape).
  const droppedRouteCodes = {
    service: good.service,
    routes: good.routes.replace(
      `["E_LOAD_WRITE_CONFLICT", "E_LOAD_STOP_WRITE_CONFLICT", "E_LOAD_STOP_ARCHIVE_CONFLICT", "E_LOAD_CHARGE_DEACTIVATE_INCOMPLETE", "E_LOAD_CHARGE_INSERT_FAILED"]`,
      `["E_LOAD_WRITE_CONFLICT", "E_LOAD_STOP_WRITE_CONFLICT", "E_LOAD_STOP_ARCHIVE_CONFLICT"]`,
    ),
  };
  if (droppedRouteCodes.routes === good.routes) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-route-codes pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedRouteCodes).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped route error-code wiring regression escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 3 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Edit Load charge replacement snapshot-locks, requires complete deactivation, and requires every replacement insert`);
