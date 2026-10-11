#!/usr/bin/env tsx
/**
 * Lead 443.42 #6 (AUTH-414) — fill ONCE, where NULL, the entity and load of the USMCA postings written since 2026-10-11T00:50Z,
 * through the writer's own resolution (posting-line-writer.ts resolvePostingSourceEntity / resolvePostingSourceLoad):
 *   - entity: Relay deposits (every leg) and Relay fills -> vendor Relay; every other source per the writer's rule.
 *   - load, Relay fill: the fill's purchase record (fuel.fuel_transactions.relay_fuel_transaction_id), exactly one load.
 *   - load, settlement application JE (source driver_settlement): each A/P debit is matched to the non-cash bill payment the
 *     A/P chain wrote with the same memo + amount on one of the settlement's load bills (paired 1:1 in creation order when
 *     several share memo + amount) -> that bill's load; a credit line whose payments all sit on ONE load bill -> that load.
 *     A credit spread over several load bills stays NULL (a posting is never split) — listed.
 *   - reversal lines: the load / entity of the line they reverse (second pass).
 * Legitimately load-less and left NULL: Relay deposit legs (wallet funding), credits spread over several load bills,
 * the negative-settlement receivable.
 * No amount, account, side or JE changes; trial balance + posting count asserted unchanged before COMMIT. No DELETE.
 *
 * Usage:
 *   DATABASE_URL=<db> npx tsx scripts/ops/2026-10-11-cc2-443-42-d6-entity-load-fill.ts                (dry run — rolled back)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-42-d6-entity-load-fill.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-414 npx tsx scripts/ops/2026-10-11-cc2-443-42-d6-entity-load-fill.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { resolvePostingSourceEntity, resolvePostingSourceLoad } from "../../apps/backend/src/accounting/posting-line-writer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SINCE = "2026-10-11T00:50:00Z";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-414") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-414 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

type Row = {
  id: string; je: string; line_sequence: number; source_transaction_type: string | null; source_transaction_id: string | null;
  reversal_of_line_id: string | null; description: string | null; amount_cents: string; debit_or_credit: string;
  entity_null: boolean; load_null: boolean;
};

const client = new pg.Client({ connectionString: url });
await client.connect();
const counts = async (label: string) => {
  const r = (await client.query<{ total: string; ent: string; load: string }>(
    `SELECT count(*)::text total, count(*) FILTER (WHERE entity_uuid IS NULL)::text ent, count(*) FILTER (WHERE load_id IS NULL)::text load
       FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND created_at >= $2::timestamptz`, [USMCA, SINCE])).rows[0]!;
  console.log(`${label}: postings ${r.total}, entity NULL ${r.ent}, load NULL ${r.load}`);
};
const setEntity = (id: string, e: string, t: string) =>
  client.query(`UPDATE accounting.journal_entry_postings SET entity_uuid = $1::uuid, entity_type = $2 WHERE id = $3::uuid AND entity_uuid IS NULL`, [e, t, id]);
const setLoad = (id: string, l: string) =>
  client.query(`UPDATE accounting.journal_entry_postings SET load_id = $1::uuid WHERE id = $2::uuid AND load_id IS NULL`, [l, id]);

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const tb = async () => (await client.query<{ n: string; rows: string }>(
    `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1`, [USMCA])).rows[0]!;
  const before = await tb();
  await counts("BEFORE");

  const rows = (await client.query<Row>(
    `SELECT id::text, journal_entry_uuid::text je, line_sequence, source_transaction_type, source_transaction_id::text,
            reversal_of_line_id::text, description, amount_cents::text, debit_or_credit,
            (entity_uuid IS NULL) entity_null, (load_id IS NULL) load_null
       FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid AND created_at >= $2::timestamptz AND (entity_uuid IS NULL OR load_id IS NULL)
      ORDER BY created_at, journal_entry_uuid, line_sequence`, [USMCA, SINCE])).rows;

  const tally: Record<string, number> = {};
  const bump = (k: string) => { tally[k] = (tally[k] ?? 0) + 1; };

  // Pass 1 — originals (not reversal lines).
  const settlementJes = new Map<string, Row[]>();
  for (const r of rows.filter((x) => !x.reversal_of_line_id)) {
    if (r.entity_null) {
      const e = await resolvePostingSourceEntity(client as never, r as never);
      if (e) { await setEntity(r.id, e.entity_uuid, e.entity_type); bump(`entity ${r.source_transaction_type}`); } else bump(`entity UNRESOLVED ${r.source_transaction_type}`);
    }
    if (r.load_null) {
      if (r.source_transaction_type === "fuel_event") {
        const l = await resolvePostingSourceLoad(client as never, r as never);
        if (l) { await setLoad(r.id, l); bump("load fuel_event"); } else bump("load NONE fuel_event");
      } else if (r.source_transaction_type === "driver_settlement") {
        const list = settlementJes.get(r.je) ?? [];
        list.push(r);
        settlementJes.set(r.je, list);
      } else bump(`load NONE ${r.source_transaction_type} (legitimately load-less)`);
    }
  }

  // Settlement application JEs: pair lines to the A/P chain's non-cash bill payments by memo (+ amount for debits).
  for (const [, lines] of settlementJes) {
    const settlementId = lines[0]!.source_transaction_id;
    const bps = (await client.query<{ memo: string; amount_cents: string; load_id: string | null }>(
      `SELECT bp.memo, bp.amount_cents::text, b.load_id::text
         FROM driver_finance.driver_settlement_gl_bills g
         JOIN accounting.bills b ON b.id = g.accounting_bill_id
         JOIN accounting.bill_payments bp ON bp.bill_id = b.id AND bp.settlement_deduction_noncash
        WHERE g.settlement_id::text = $1
        ORDER BY bp.trace_no, bp.created_at, bp.id`, [settlementId])).rows;
    const byMemo = new Map<string, typeof bps>();
    for (const bp of bps) byMemo.set(bp.memo, [...(byMemo.get(bp.memo) ?? []), bp]);
    const groups = new Map<string, Row[]>();
    for (const l of lines) {
      const k = `${l.debit_or_credit}|${l.description}|${l.debit_or_credit === "debit" ? l.amount_cents : ""}`;
      groups.set(k, [...(groups.get(k) ?? []), l]);
    }
    for (const [k, ls] of groups) {
      const [dc, memo, amt] = k.split("|");
      const pays = (byMemo.get(memo ?? "") ?? []).filter((p) => dc === "credit" || p.amount_cents === amt);
      if (dc === "debit") {
        if (pays.length === ls.length) {
          const sorted = [...ls].sort((a, z) => a.line_sequence - z.line_sequence);
          for (let i = 0; i < sorted.length; i++) {
            const load = pays[i]!.load_id;
            if (load) { await setLoad(sorted[i]!.id, load); bump("load settlement A/P debit"); } else bump("load NONE settlement A/P debit (bill has no load)");
          }
        } else for (const _ of ls) bump("load NONE settlement A/P debit (no 1:1 payment match)");
      } else {
        const loads = [...new Set(pays.map((p) => p.load_id).filter(Boolean))];
        for (const l of ls) {
          if (loads.length === 1) { await setLoad(l.id, loads[0]!); bump("load settlement credit (one load bill)"); }
          else bump(`load NONE settlement credit (${loads.length === 0 ? "no payment" : "spread over several load bills"})`);
        }
      }
    }
  }

  // Pass 2 — reversal lines take the entity / load of the line they reverse (now filled).
  for (const r of rows.filter((x) => x.reversal_of_line_id)) {
    const o = (await client.query<{ entity_uuid: string | null; entity_type: string | null; load_id: string | null }>(
      `SELECT entity_uuid::text, entity_type, load_id::text FROM accounting.journal_entry_postings WHERE id = $1::uuid`, [r.reversal_of_line_id])).rows[0];
    if (r.entity_null && o?.entity_uuid && o.entity_type) { await setEntity(r.id, o.entity_uuid, o.entity_type); bump("entity reversal"); }
    if (r.load_null) { if (o?.load_id) { await setLoad(r.id, o.load_id); bump("load reversal"); } else bump("load NONE reversal (original has none)"); }
  }

  for (const [k, n] of Object.entries(tally).sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  const after = await tb();
  if (before.n !== after.n || before.rows !== after.rows) throw new Error(`REFUSED: trial balance or count changed ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  console.log(`Trial balance unchanged: ${after.n} cents across ${after.rows} postings.`);
  await counts("AFTER");
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); console.log("DRY RUN — rolled back."); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
