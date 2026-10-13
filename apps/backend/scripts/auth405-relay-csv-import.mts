/**
 * AUTH-405 (Lead, on the owner's orders 2026-10-10 7:15 PM CT "the engine be correctly built ... parse the relay transactions",
 * 6:58 PM full authorization, card map 7:26-7:30 PM): load the owner's Relay "All Transactions" file into USMCA through the
 * EXISTING Relay CSV import route (POST /api/integrations/relay/fuel/import-csv), which stores every row and posts each SETTLED
 * deposit with the 443.29 b poster (postRelayDeposit): 0680 -> 1000, 9708/1354/4823 -> 8000, 5007 -> 2500-00-001; personal and
 * unnamed cards HELD; a deposit whose card charge is already categorized on the funding account's bank feed HELD (no double count).
 *
 * The route is not copied: this script mounts registerRelayFuelCsvImportRoute itself on a bare Fastify instance, supplies the
 * Owner as the session user (the route's own Owner/Administrator check still runs), and injects the file. Same handler, same
 * single transaction, same poster.
 *
 * Then it prints the Relay Fuel Wallet (1295) balance at the end of each day 08-03..08-10 (posted entries only).
 *
 * MODES: --branch=<neon branch id> REQUIRED. On the production branch it additionally needs OWNER_AUTH_ID=AUTH-405 whose block in
 *   docs/bus/OWNER-AUTHORIZATIONS.md is OPEN (verify-owner-authorization.mjs). On a throwaway fork it runs (and COMMITS) freely.
 * RUN: DATABASE_URL=<branch> npx tsx apps/backend/scripts/auth405-relay-csv-import.mts --branch=br-xxx --file=<Relay csv>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import pg from "pg";
import { registerRelayFuelCsvImportRoute } from "../src/integrations/relay-payments/relay-fuel-csv-import.routes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_BRANCH = "br-fancy-credit-akjnd07a";
const arg = (k: string) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").slice(k.length + 3);
const BRANCH = arg("branch");
const FILE = arg("file");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL (the target branch) is required");
if (!BRANCH) throw new Error("--branch=<neon branch id> is required");
if (!FILE || !fs.existsSync(FILE)) throw new Error("--file=<Relay All Transactions csv> is required");
if (BRANCH === PROD_BRANCH) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-405") throw new Error(`production needs OWNER_AUTH_ID=AUTH-405 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function read<T extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const r = await c.query<T>(sql, values);
    await c.query("ROLLBACK");
    return r.rows;
  } finally {
    c.release();
  }
}

const walletByDay = () =>
  read<{ day: string; deposits: string; outflow: string; balance: string }>(
    `WITH days AS (SELECT generate_series('2026-08-03'::date, '2026-08-10'::date, '1 day')::date AS day),
          w AS (SELECT p.debit_or_credit, p.amount_cents, je.entry_date
                  FROM accounting.journal_entry_postings p
                  JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
                  JOIN accounting.chart_of_accounts_roles r ON r.account_id = p.account_id AND r.is_active AND r.role = 'fuel_wallet_relay'
                 WHERE p.operating_company_id = $1::uuid)
     SELECT d.day::text,
            COALESCE(sum(w.amount_cents) FILTER (WHERE w.entry_date = d.day AND w.debit_or_credit = 'debit'), 0)::text AS deposits,
            COALESCE(sum(w.amount_cents) FILTER (WHERE w.entry_date = d.day AND w.debit_or_credit = 'credit'), 0)::text AS outflow,
            COALESCE(sum(CASE WHEN w.debit_or_credit = 'debit' THEN w.amount_cents ELSE -w.amount_cents END) FILTER (WHERE w.entry_date <= d.day), 0)::text AS balance
       FROM days d LEFT JOIN w ON true GROUP BY d.day ORDER BY d.day`,
    [USMCA]
  );
const money = (c: string | number) => (Number(c) / 100).toFixed(2);

const before = await walletByDay();
console.log("1295 Relay Fuel Wallet BEFORE (end of day):", before.map((r) => `${r.day} ${money(r.balance)}`).join(" | "));

const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });
app.decorateRequest("user", null);
app.decorateRequest("session", null);
app.addHook("preHandler", async (req) => {
  (req as unknown as { user: unknown; session: unknown }).user = { uuid: OWNER, role: "Owner" };
  (req as unknown as { user: unknown; session: unknown }).session = { id: "auth405-ops-script" };
});
await registerRelayFuelCsvImportRoute(app);
await app.ready();
const res = await app.inject({
  method: "POST",
  url: `/api/integrations/relay/fuel/import-csv?operating_company_id=${USMCA}`,
  headers: { "content-type": "text/csv" },
  payload: fs.readFileSync(FILE, "utf8"),
});
await app.close();
const body = res.json() as Record<string, unknown>;
console.log(`route HTTP ${res.statusCode}`);
const { deposits_held: held, deposits_refused: refused, rejected_rows: _rows, ...summary } = body as {
  deposits_held?: Array<Record<string, unknown>>;
  deposits_refused?: Array<Record<string, unknown>>;
  rejected_rows?: unknown;
} & Record<string, unknown>;
console.log("route summary:", JSON.stringify(summary));
for (const o of [...(held ?? []), ...(refused ?? [])])
  console.log(`  ${o.outcome} ${o.deposit_id} ${o.reason ?? ""} card ${o.card ?? "-"} charged ${o.charged_cents != null ? money(o.charged_cents as number) : "-"} ${o.label ?? ""} ${o.bank_transaction_id ?? ""}`);

const after = await walletByDay();
console.log("1295 Relay Fuel Wallet AFTER (end of day):");
for (const r of after) console.log(`  ${r.day}  in ${money(r.deposits)}  out ${money(r.outflow)}  balance ${money(r.balance)}`);
await pool.end();
process.exit(res.statusCode === 200 ? 0 : 1);
