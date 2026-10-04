// AUTH-218 — void-is-whole: AUTH-217 reversed the six settlement-line DEF postings (ACCT-F403: a Relay-rail settlement line
// posts no fuel) and left their fuel rows live, so verify-void-is-whole reads each as a Direction-1 silent void (ledger all
// dead, header live). Each fuel row is voided through executeVoidCancel('fuel_transaction') (stampDocumentVoided). Nothing
// deleted. Dry run fires deferred constraints, then throws. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FUEL = [
  "696237be-e8ed-4f88-980a-3c92fed1a9ec", "b7a746e4-274b-4e03-adf8-7aebd6393ab8", "cb583ff7-11a1-46aa-828a-a07c1edc604b",
  "d6053286-a6ae-4d29-994c-94a94484a7d4", "db98d022-4e55-412e-81bd-ea1a12017527", "e16a0cb4-b0b9-4f64-a37d-96ded98a7a3d",
];
const REASON = "ACCT-F403: settlement-line DEF row on the Relay rail; its posting was reversed under AUTH-217 — the Relay fill carries the cost. AUTH-218, 2026-10-04.";

const apply = process.argv.includes("--apply");
let authId: string | null = null;
if (apply) {
  const i = process.argv.indexOf("--auth");
  authId = i > 0 ? process.argv[i + 1] : "AUTH-MISSING";
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", authId], { stdio: "inherit" });
}
const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const { executeVoidCancel } = await import("../../apps/backend/src/governance/void-cancel-executors.js");

let report: any;
try {
  await withLuciaBypass(
    async (c: any) => {
      await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
      const live = (
        await c.query(
          `SELECT ft.id::text FROM fuel.fuel_transactions ft
            WHERE ft.operating_company_id = $1::uuid AND ft.id = ANY($2::uuid[]) AND ft.voided_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL)`,
          [USMCA, FUEL],
        )
      ).rows;
      if (live.length !== 6) throw new Error(`REFUSE: expected six live fuel rows with no live expense, found ${live.length}`);
      const voided = [];
      for (const r of live) {
        const out = await executeVoidCancel("fuel_transaction", { client: c, operatingCompanyId: USMCA, entityId: r.id, userId: OWNER, reason: REASON } as never);
        if ((out as { kind: string }).kind !== "ok") throw new Error(`FINDING: fuel void refused ${r.id}: ${JSON.stringify(out)}`);
        voided.push(r.id.slice(0, 8));
      }
      report = { voided };
      if (apply) {
        await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
          "cc3.def_relay_rail_fuel_void", JSON.stringify({ auth_id: authId, operating_company_id: USMCA, voided: FUEL }), `CC-3-${authId}`,
        ]);
      } else {
        await c.query("SET CONSTRAINTS ALL IMMEDIATE");
        throw new Error("PROOF_ROLLBACK");
      }
    },
    { actorUserId: OWNER },
  );
  console.log(`def_relay_rail_fuel_void: APPLIED under ${authId}`, JSON.stringify(report));
} catch (e) {
  if ((e as Error).message === "PROOF_ROLLBACK") console.log("def_relay_rail_fuel_void: DRY RUN (deferred constraints fired, rolled back)", JSON.stringify(report));
  else { console.error("def_relay_rail_fuel_void: FAILED —", (e as Error).message); process.exitCode = 1; }
} finally {
  const { pool, luciaPool } = (await import("../../apps/backend/src/auth/db.js")) as any;
  await luciaPool?.end?.().catch(() => {});
  await pool?.end?.().catch(() => {});
}
