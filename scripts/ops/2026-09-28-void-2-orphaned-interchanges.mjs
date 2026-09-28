// AUTH-093 follow-up: void the 2 trailer_interchanges rows created for loads 13623/13627, which
// were themselves voided in this same round for having no source document. cancelLoadInClientTx
// does not touch dispatch.trailer_interchanges (a newer table than that cascade), so this is the
// explicit cleanup step.
import { register } from "tsx/esm/api";
register();
const { withCurrentUser } = await import("../../apps/backend/src/auth/db.ts");
const { setScopedCompanyContext } = await import("../../apps/backend/src/_helpers/scoped-company-context.ts");
const { voidTrailerInterchange } = await import("../../apps/backend/src/dispatch/trailer-interchange.service.ts");

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const INTERCHANGE_IDS = ["9aa7a8ae-ac0a-4bbe-bac2-0bbd4ca3b2c2", "c5186aa8-1fc9-4d74-882a-87883c3658d0"];

async function main() {
  for (const id of INTERCHANGE_IDS) {
    try {
      const result = await withCurrentUser(OWNER, async (client) => {
        await setScopedCompanyContext(client, OWNER, USMCA);
        return voidTrailerInterchange(client, {
          operating_company_id: USMCA,
          interchange_id: id,
          reason: "ROUND 155.20 JOB 1: the load this interchange was attached to (13623/13627) was voided for having no source document.",
          actor_user_id: OWNER,
        });
      });
      console.log(`${id}: ${JSON.stringify(result)}`);
    } catch (err) {
      console.log(`${id}: ERROR ${err?.message ?? err}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
