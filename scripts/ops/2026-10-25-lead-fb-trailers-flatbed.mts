/**
 * LEAD 10-25-2026 — owner ruling (9:37 PM CT): "if they are flatbed then mark as flatbed update app".
 * FB-56707, FB-56711 and 56702 are the only live (non -DUP-VOID) trailers in the FB series still typed DryVan;
 * every other live FB trailer is Flatbed. This sets those three to Flatbed. The loads that carried them are then
 * re-derived by the existing evidence script (2026-10-25-lead-load-trailer-type-from-evidence.mts) under AUTH-472.
 * Dry run by default (rolled back); --apply commits. No money write.
 */
import pg from "pg";
import { execFileSync } from "node:child_process";
const APPLY = process.argv.includes("--apply");
if (APPLY) {
  try { execFileSync("node", ["scripts/verify-owner-authorization.mjs", process.env.OWNER_AUTH_ID ?? "AUTH-472"], { stdio: "inherit" }); } catch { process.exit(1); }
}
const NUMBERS = ["FB-56707", "FB-56711", "56702"];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const before = (await client.query(
    `SELECT equipment_number, equipment_type::text FROM mdata.equipment WHERE equipment_number = ANY($1) ORDER BY 1`, [NUMBERS])).rows;
  const upd = await client.query(
    `UPDATE mdata.equipment SET equipment_type = 'Flatbed', updated_at = now(),
            status_change_reason = COALESCE(status_change_reason, 'owner ruling 2026-10-25: FB series is flatbed')
      WHERE equipment_number = ANY($1) AND equipment_type::text = 'DryVan' AND deactivated_at IS NULL
      RETURNING equipment_number`, [NUMBERS]);
  const after = (await client.query(
    `SELECT equipment_number, equipment_type::text FROM mdata.equipment WHERE equipment_number = ANY($1) ORDER BY 1`, [NUMBERS])).rows;
  await client.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify({ mode: APPLY ? "APPLY" : "DRY RUN (rolled back)", before, updated: upd.rowCount, after }, null, 2));
} catch (e) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(String((e as Error).message));
  process.exit(1);
} finally {
  await client.end();
}
