// Prints, for every active USMCA driver, which driver-profile blocks returned a value and which a named empty
// reason (and any malformed block), for scripts/verify-driver-profile-linkage.mjs. Read-only (BEGIN READ ONLY).
import pg from "pg";
import { readDriverProfile, DRIVER_PROFILE_BLOCKS } from "../../apps/backend/src/mdata/canonical/driver-profile.service.js";

const [oc] = process.argv.slice(2);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 60000 });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const drivers = (await c.query(
    `SELECT id, first_name || ' ' || last_name AS name FROM mdata.drivers
      WHERE operating_company_id = $1 AND deactivated_at IS NULL AND merged_into_driver_id IS NULL ORDER BY 2`, [oc])).rows;
  const out = [];
  for (const d of drivers) {
    const p = (await readDriverProfile(c as never, oc!, d.id)) as Record<string, { value: unknown; empty_reason: string | null }> | null;
    const blocks: Record<string, "value" | "reason" | "malformed"> = {};
    for (const b of DRIVER_PROFILE_BLOCKS) {
      const blk = p?.[b];
      blocks[b] = !blk || !("value" in blk) ? "malformed" : blk.empty_reason ? (blk.empty_reason.trim() ? "reason" : "malformed") : "value";
    }
    out.push({ id: d.id, name: d.name, blocks });
  }
  await c.query("ROLLBACK");
  process.stdout.write(JSON.stringify(out));
} finally {
  await c.end();
}
