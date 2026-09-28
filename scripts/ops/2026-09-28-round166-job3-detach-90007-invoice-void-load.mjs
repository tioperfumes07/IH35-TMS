// AUTH-100 — ROUND 166 JOB 3: load 90007 does not exist (a fabricated load number invented to
// carry Faro invoice #7, ITS Logistics LLC, PO 68747, $350.00 -- a real purchased invoice with no
// real load in the Faro reconciliation). Its $0.00 driver bill was already voided by the Lead. The
// $350 invoice is REAL (Faro bought it) -- detach it from the fake load (never delete it), then
// void the fabricated load itself.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";
register();
const { withCurrentUser } = await import("../../apps/backend/src/auth/db.ts");
const { setScopedCompanyContext } = await import("../../apps/backend/src/_helpers/scoped-company-context.ts");
const { cancelLoadInClientTx } = await import("../../apps/backend/src/dispatch/cancellation.service.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// AUTH-100 (docs/bus/OWNER-AUTHORIZATIONS.md) authorized this script's one-time run, already
// executed and closed. Added retroactively (ROUND 133 P0) so a bare re-run correctly refuses now
// that AUTH-100 is closed, rather than silently re-running unauthorized.
const AUTH_ID = "AUTH-100";
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${AUTH_ID} rejected by verify-owner-authorization.mjs -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_ID = "f465285d-fe9a-4b24-bcd7-e5a03cdadc9e"; // load_number 90007
const INVOICE_ID = "bba8411e-909e-4f1d-af21-1729a25a1ae7";

async function main() {
  const result = await withCurrentUser(OWNER, async (client) => {
    await setScopedCompanyContext(client, OWNER, USMCA);

    // 1. Detach the real invoice from the fabricated load. Never delete it -- it is a real,
    // already-sent, already-purchased-by-Faro invoice. Carried forward as a non-freight invoice
    // with no load link, per the order's own explicit second option.
    const detached = await client.query(
      `UPDATE accounting.invoices
          SET source_load_id = NULL,
              internal_notes = COALESCE(internal_notes || E'\n', '') ||
                'ROUND 166 JOB 3: detached from fabricated load 90007 (invented to carry Faro invoice #7, PO 68747). Invoice itself is real -- Faro purchased it -- and is kept as a non-freight invoice with no load link.'
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        RETURNING id::text, display_id, source_load_id, total_cents`,
      [INVOICE_ID, USMCA]
    );
    if (!detached.rows[0]) return { skipped: "invoice not found" };

    // 2. Void the fabricated load itself, through the real cancellation path.
    const cancelled = await cancelLoadInClientTx(client, OWNER, "Owner", {
      operating_company_id: USMCA,
      load_id: LOAD_ID,
      reason_code: "OTHER",
      cancellation_notes:
        "ROUND 166 JOB 3 (owner ruling): load 90007 does not exist -- a fabricated load number " +
        "invented to carry Faro invoice #7 (ITS Logistics LLC, PO 68747, $350.00), a real " +
        "purchased invoice with no real load in the Faro reconciliation. The invoice was detached " +
        "and kept (not deleted) as a non-freight invoice before this void. Its $0.00 driver bill " +
        "was already voided separately.",
      billable_to_customer: false,
    });

    return { detached: detached.rows[0], load_cancelled: cancelled };
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
