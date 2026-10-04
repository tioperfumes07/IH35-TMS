// AUTH-217 — ACCT-F403 (Lead ruling Option 1): an AlwaysTrack settlement fuel line on the Relay rail posts NO fuel; the cost is
// the Relay fill at Relay's charge, posted when its wallet line is matched. AUTH-215 (CC-3, earlier today) re-created six DEF
// purchases from the signed settlements and POSTED them (fuel_event JE adopted by an expense document) — that is exactly the
// settlement-line posting the ruling forbids, and verify-fuel-cost-posts-exactly-once went red on main (12 live fuel_event
// postings; 5000 off by $170.63 = those six). The six expenses are voided through the void engine (postVoidReversal reverses
// their adopted fuel_event JE is reversed by the journal-entry executor); the six fuel rows stay — they are the settlement record and link to their Relay fill in the corrections.
// Dry run (default): fires deferred constraints, then throws. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const RECEIPTS = ["99301244", "99442334", "99444239", "2885954", "99602755", "99912182"];
const REASON = "ACCT-F403: a settlement fuel line on the Relay rail posts no fuel — its Relay fill carries the cost. Reverses AUTH-215's six DEF postings. AUTH-217, 2026-10-04.";

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
      const rows = (
        await c.query(
          `SELECT ft.transaction_reference ref, e.id::text eid, e.total_amount_cents c, e.journal_entry_id::text je
             FROM fuel.fuel_transactions ft
             JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
            WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL AND ft.fuel_type = 'def'
              AND ft.transaction_reference = ANY($2::text[]) AND ft.created_at > '2026-10-04'`,
          [USMCA, RECEIPTS],
        )
      ).rows;
      if (rows.length !== 6) throw new Error(`REFUSE: expected the six AUTH-215 DEF expenses, found ${rows.length}`);
      const voided = [];
      for (const r of rows) {
        // The document ADOPTED a fuel_event JE, so the expense void only flips it; the JE is reversed by its own executor.
        const je = await executeVoidCancel("journal_entry", { client: c, operatingCompanyId: USMCA, entityId: r.je, userId: OWNER, reason: REASON } as never);
        if ((je as { kind: string }).kind !== "ok") throw new Error(`FINDING: journal entry reversal refused ${r.je}: ${JSON.stringify(je)}`);
        const out = await executeVoidCancel("expense", { client: c, operatingCompanyId: USMCA, entityId: r.eid, userId: OWNER, reason: REASON } as never);
        if (!["ok", "already_done"].includes((out as { kind: string }).kind)) throw new Error(`FINDING: expense void refused ${r.eid}: ${JSON.stringify(out)}`);
        voided.push({ receipt: r.ref, expense: r.eid.slice(0, 8), cents: Number(r.c), je: r.je.slice(0, 8), je_reversal: (je as any).reversing_entry_ref ?? null, expense_void: (out as any).kind });
      }
      const live = (
        await c.query(
          `SELECT count(*)::int n FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
            WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'fuel_event' AND j.status = 'posted'
              AND j.reversed_by_je_id IS NULL AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL`,
          [USMCA],
        )
      ).rows[0].n;
      if (live !== 0) throw new Error(`REFUSE: ${live} live fuel_event posting(s) remain`);
      report = { voided, live_fuel_event_postings_after: live };
      if (apply) {
        await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
          "cc3.def_relay_rail_unpost", JSON.stringify({ auth_id: authId, operating_company_id: USMCA, voided }), `CC-3-${authId}`,
        ]);
      } else {
        await c.query("SET CONSTRAINTS ALL IMMEDIATE");
        throw new Error("PROOF_ROLLBACK");
      }
    },
    { actorUserId: OWNER },
  );
  console.log(`def_relay_rail_unpost: APPLIED under ${authId}`);
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  if ((e as Error).message === "PROOF_ROLLBACK") {
    console.log("def_relay_rail_unpost: DRY RUN (deferred constraints fired, thrown, rolled back)");
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.error("def_relay_rail_unpost: FAILED —", (e as Error).message);
    process.exitCode = 1;
  }
} finally {
  const { pool, luciaPool } = (await import("../../apps/backend/src/auth/db.js")) as any;
  await luciaPool?.end?.().catch(() => {});
  await pool?.end?.().catch(() => {});
}
