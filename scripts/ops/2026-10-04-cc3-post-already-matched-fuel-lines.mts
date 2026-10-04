// BANK-F2026100403 — post the USMCA fuel / Relay bank lines that were MATCHED before the match-time poster existed
// (2026-09-28 R186 accepts; ACCT-F9335 only posts inside a new accept), through postAlreadyMatchedFuelLine — the same
// poster a fresh accept uses, on this transaction, stamping matched_journal_entry_id. Each line runs in a SAVEPOINT: a
// refusal (no unit / no load at fill time / zero amount) is REPORTED and that line stays unposted — never guessed.
// Dry run (default) ends in a throw inside withLuciaBypass. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const apply = process.argv.includes("--apply");
let authId: string | null = null;
if (apply) {
  const i = process.argv.indexOf("--auth");
  authId = i > 0 ? process.argv[i + 1] : "AUTH-MISSING";
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", authId], { stdio: "inherit" });
}

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const { postAlreadyMatchedFuelLine } = await import("../../apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.js");

let report: any;
try {
  await withLuciaBypass(
    async (c: any) => {
      await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
      const lines = (
        await c.query(
          `SELECT id::text, amount_cents::bigint AS cents
             FROM banking.bank_transactions
            WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND review_state = 'matched'
              AND matched_journal_entry_id IS NULL
              AND (matched_relay_fuel_transaction_id IS NOT NULL OR matched_fuel_transaction_id IS NOT NULL)
            ORDER BY transaction_date, id`,
          [USMCA],
        )
      ).rows;
      const posted: any[] = [];
      const refused: Record<string, string[]> = {};
      for (const l of lines) {
        await c.query("SAVEPOINT one_line");
        try {
          const r = await postAlreadyMatchedFuelLine(c, { operating_company_id: USMCA, actor_user_uuid: OWNER, bank_transaction_id: l.id });
          await c.query("RELEASE SAVEPOINT one_line");
          posted.push({ line: l.id.slice(0, 8), kind: r.kind, je: r.journal_entry_id.slice(0, 8) });
        } catch (e) {
          await c.query("ROLLBACK TO SAVEPOINT one_line");
          const code = String((e as { code?: string }).code ?? (e as Error).message.split(":")[0]);
          (refused[code] ??= []).push(l.id.slice(0, 8));
        }
      }
      const left = (
        await c.query(
          `SELECT count(*)::int n FROM banking.bank_transactions
            WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND review_state = 'matched' AND matched_journal_entry_id IS NULL
              AND (matched_relay_fuel_transaction_id IS NOT NULL OR matched_fuel_transaction_id IS NOT NULL)`,
          [USMCA],
        )
      ).rows[0].n;
      report = { candidates: lines.length, posted: posted.length, refused, still_unposted: left, sample: posted.slice(0, 5) };
      if (apply) {
        await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
          "cc3.post_already_matched_fuel_lines",
          JSON.stringify({ auth_id: authId, operating_company_id: USMCA, posted: posted.length, refused }),
          `CC-3-${authId}`,
        ]);
      } else {
        throw new Error("PROOF_ROLLBACK");
      }
    },
    { actorUserId: OWNER },
  );
  console.log(`post_already_matched_fuel_lines: APPLIED under ${authId}`);
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  if ((e as Error).message === "PROOF_ROLLBACK") {
    console.log("post_already_matched_fuel_lines: DRY RUN (thrown, rolled back)");
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.error("post_already_matched_fuel_lines: FAILED —", (e as Error).message);
    process.exitCode = 1;
  }
} finally {
  const { pool, luciaPool } = (await import("../../apps/backend/src/auth/db.js")) as any;
  await luciaPool?.end?.().catch(() => {});
  await pool?.end?.().catch(() => {});
}
