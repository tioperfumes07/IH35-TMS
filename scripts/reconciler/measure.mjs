// Runs the reconciler read-only against the live database: one READ ONLY transaction, rolled back.
// Detection only — this path never repairs and never writes. Fails closed with no DATABASE_URL.
import { register } from "tsx/esm/api";
import { requireLiveDbOrExit } from "../lib/require-live-db.mjs";

register();
const { runReconciler } = await import("../../apps/backend/src/reconciler/run.ts");
const { RECONCILER_INVARIANTS } = await import("../../apps/backend/src/reconciler/registry.ts");

export const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
export { RECONCILER_INVARIANTS };

export async function measureReconciler({ label, operatingCompanyId = USMCA_COMPANY_ID }) {
  const { client, pool } = await requireLiveDbOrExit({ label });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const run = await runReconciler(client, operatingCompanyId);
    await client.query("ROLLBACK");
    return run;
  } finally {
    client.release();
    await pool.end();
  }
}
