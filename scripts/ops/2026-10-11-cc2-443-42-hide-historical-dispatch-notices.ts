#!/usr/bin/env tsx
/**
 * Lead 443.42 #7 (AUTH-415): hide, through hideDriverPwaNotifications (the notifications engine), every driver-app notice
 * "Load N dispatched" that the dispatch chain fired on 2026-10-11 for a load that ALREADY RAN — a Settlement Creator load
 * (the load belongs to a driver settlement) whose first stop was due before the notice existed. Kept in history.
 *
 * Usage:
 *   DATABASE_URL=<db> npx tsx scripts/ops/2026-10-11-cc2-443-42-hide-historical-dispatch-notices.ts                (dry run)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-42-hide-historical-dispatch-notices.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-415 npx tsx scripts/ops/2026-10-11-cc2-443-42-hide-historical-dispatch-notices.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { hideDriverPwaNotifications } from "../../apps/backend/src/pwa/driver-notifications.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-415") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-415 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const ids = (
    await client.query<{ id: string }>(
      `SELECT p.id::text
         FROM pwa.driver_notifications p
         JOIN mdata.loads l ON l.id = (p.payload->>'load_id')::uuid AND l.operating_company_id = p.operating_company_id
        WHERE p.operating_company_id = $1::uuid
          AND p.created_at >= '2026-10-11T00:00:00Z'
          AND p.title ~ '^Load [0-9]+ dispatched$'
          AND coalesce(p.payload->>'hidden', 'false') <> 'true'
          AND (SELECT min(s.scheduled_arrival_at) FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL) < p.created_at
          AND (EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.load_id = l.id)
               OR EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills g WHERE g.load_number = l.load_number AND g.operating_company_id = l.operating_company_id))
        ORDER BY p.created_at`,
      [USMCA]
    )
  ).rows.map((r) => r.id);
  const hidden = await hideDriverPwaNotifications(client as never, {
    operatingCompanyId: USMCA, ids, reason: "load already ran — Settlement Creator booking, not a dispatch (443.41/443.42)", actorUserId: OWNER,
  });
  const left = await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM pwa.driver_notifications
      WHERE operating_company_id = $1::uuid AND created_at >= '2026-10-11' AND title ~ '^Load [0-9]+ dispatched$'
        AND coalesce(payload->>'hidden','false') <> 'true'`, [USMCA]);
  console.log(`Matched ${ids.length}; hidden ${hidden.length}; "Load N dispatched" notices from today still visible: ${left.rows[0]!.n}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); console.log("DRY RUN — rolled back."); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
