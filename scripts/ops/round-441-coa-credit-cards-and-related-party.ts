#!/usr/bin/env tsx
/**
 * ROUND 441 (owner order 2026-10-07, CC-1 A1–A4): the USMCA chart of accounts gets
 *   A1  a "Credit Cards" parent with the card accounts under it (the PAY CREDIT CARD drawer had no
 *       Citi account and no card parent, so the owner could not record the 09/21/2026 $600.00 Citi payment);
 *   A2  one sub-account per related party under 2410 Owner / Related-Party Loan Payable.
 *
 * A3: every write goes through the app's own account engine — POST / PATCH /api/v1/catalogs/accounts,
 * mounted here on a local Fastify instance and driven with app.inject() as the Owner. That runs the route's
 * validation, sample-name refusal, detail-type resolution, insert/update, crud audit and account-push queue
 * exactly as the New Account screen does. No SQL write in this file.
 *
 * Numbering follows the live convention (parent NNNN, children NNNN-00-0NN):
 *   2500        Credit Cards                         header (not postable), subtype CreditCard
 *   2500-00-001 Amex Credit Card Payable             the EXISTING 2500 — renumbered only if it has ZERO
 *                                                    postings (order: never renumber posted history);
 *                                                    otherwise it keeps 2500 and the parent takes 2490
 *   2500-00-002 Citi Credit Card 1345                new, subtype CreditCard
 *   2510        Dreamline Diesel Card Payable        parent set, NUMBER KEPT — the fuel card-rail resolver
 *                                                    (fuel-posting/poster.service.ts) finds it by "2510"
 *   2410-00-001 Jorge Pablo Guadalupe Muñoz Gonzalez — Related-Party Loan
 *   2410-00-002 Scentsx — Related-Party Loan
 *   2410-00-003 Tio Perfumes 2 — Related-Party Loan
 *   2410-00-004 Laura Muñoz — Related-Party Loan     (all subtype OtherCurrentLiability, parent 2410)
 *
 * Idempotent: every step reads the current state first and skips what is already right.
 *
 * Run (dry run is the default and writes nothing):
 *   DATABASE_URL=<target> npx tsx scripts/ops/round-441-coa-credit-cards-and-related-party.ts --actor-user-id <owner uuid>
 *   DATABASE_URL=<target> npx tsx scripts/ops/round-441-coa-credit-cards-and-related-party.ts --actor-user-id <owner uuid> \
 *     --execute --expect-host <neon endpoint host>
 */
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerAccountRoutes } from "../../apps/backend/src/catalogs/accounts.routes.js";

type Acct = {
  id: string;
  account_number: string | null;
  account_name: string;
  parent_account_id: string | null;
  is_postable: boolean;
  deactivated_at: string | null;
};

const CARD_PARENT = { number: "2500", fallbackNumber: "2490", name: "Credit Cards" };
const AMEX = { currentNumber: "2500", name: "Amex Credit Card Payable", newNumber: "2500-00-001" };
const CITI = { number: "2500-00-002", name: "Citi Credit Card 1345" };
const DREAMLINE = { number: "2510", name: "Dreamline Diesel Card Payable" };
const RELATED_PARENT = { number: "2410", name: "Owner / Related-Party Loan Payable" };
const RELATED_SUBS = [
  { number: "2410-00-001", name: "Jorge Pablo Guadalupe Muñoz Gonzalez — Related-Party Loan" },
  { number: "2410-00-002", name: "Scentsx — Related-Party Loan" },
  { number: "2410-00-003", name: "Tio Perfumes 2 — Related-Party Loan" },
  { number: "2410-00-004", name: "Laura Muñoz — Related-Party Loan" },
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const actorUserId = arg("--actor-user-id");
  const expectHost = arg("--expect-host");
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is required");
  if (!actorUserId || !/^[0-9a-f-]{36}$/i.test(actorUserId)) throw new Error("--actor-user-id <Owner uuid> is required");
  if (execute && (!expectHost || new URL(url).hostname !== expectHost)) {
    throw new Error("--execute needs --expect-host equal to DATABASE_URL's host (refusing to write to an unnamed database)");
  }

  const pool = new pg.Pool({ connectionString: url, max: 3 });
  const read = async <T,>(sql: string, params: unknown[]): Promise<T[]> => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN READ ONLY");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const r = await c.query(sql, params);
      await c.query("ROLLBACK");
      return r.rows as T[];
    } finally {
      c.release();
    }
  };

  const [company] = await read<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'USMCA'`, []);
  if (!company) throw new Error("no company with code USMCA");
  const oc = company.id;
  const [actor] = await read<{ role: string }>(`SELECT role FROM identity.users WHERE id = $1::uuid AND deactivated_at IS NULL`, [actorUserId]);
  if (actor?.role !== "Owner") throw new Error("--actor-user-id must be an active Owner");

  // Subtypes are the vocabulary the live chart and the reports already key on (Amex/Dreamline "CreditCard", 2410
  // "OtherCurrentLiability"; profit-loss-sections.ts, cash-basis P&L). Not a detail_type_id: the DB trigger
  // catalogs.accounts_detail_type_scope_check compares the 8-value account_type to the catalog code/name, so every
  // Liability detail type is refused today (LST-F429 fixes that trigger separately).
  const SUBTYPE_CARD = "CreditCard";
  const SUBTYPE_LOAN = "OtherCurrentLiability";

  const accounts = async () =>
    read<Acct>(
      `SELECT id::text, account_number, account_name, parent_account_id::text, is_postable, deactivated_at::text
         FROM catalogs.accounts WHERE operating_company_id = $1::uuid`,
      [oc]
    );
  const byNumber = (all: Acct[], n: string) => all.find((a) => a.account_number === n && !a.deactivated_at) ?? null;
  const byName = (all: Acct[], n: string) => all.find((a) => a.account_name === n && !a.deactivated_at) ?? null;
  const postings = async (accountId: string) =>
    Number((await read<{ n: string }>(`SELECT count(*)::text AS n FROM accounting.journal_entry_postings WHERE account_id = $1::uuid`, [accountId]))[0]?.n ?? 0);

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerAccountRoutes(a);
  });
  const headers = {
    "x-test-auth": Buffer.from(JSON.stringify({ id: actorUserId, role: "Owner", email: null }), "utf8").toString("base64url"),
  };
  const log: string[] = [`ROUND 441 COA — ${execute ? "EXECUTE" : "DRY RUN (no writes)"} — USMCA`];

  const create = async (payload: Record<string, unknown>): Promise<string> => {
    if (!execute) {
      log.push(`  would CREATE ${payload.account_number} ${payload.account_name}`);
      return `dry-run:${payload.account_number}`;
    }
    const res = await app.inject({ method: "POST", url: `/api/v1/catalogs/accounts`, headers, payload: { ...payload, operating_company_id: oc } });
    if (res.statusCode !== 201) throw new Error(`create ${payload.account_number} failed: ${res.statusCode} ${res.body}`);
    const id = (JSON.parse(res.body) as { id: string }).id;
    log.push(`  CREATED ${payload.account_number} ${payload.account_name}`);
    return id;
  };
  const patch = async (id: string, label: string, payload: Record<string, unknown>) => {
    if (!execute) {
      log.push(`  would PATCH ${label}: ${JSON.stringify(payload)}`);
      return;
    }
    const res = await app.inject({ method: "PATCH", url: `/api/v1/catalogs/accounts/${id}`, headers, payload: { ...payload, operating_company_id: oc } });
    if (res.statusCode !== 200) throw new Error(`patch ${label} failed: ${res.statusCode} ${res.body}`);
    log.push(`  PATCHED ${label}: ${JSON.stringify(payload)}`);
  };

  try {
    // ---------------- A1: Credit Cards ----------------
    let all = await accounts();
    const amex = byName(all, AMEX.name);
    if (!amex) throw new Error(`"${AMEX.name}" not found — the order says reparent the existing one, never create a second`);
    let parent = byName(all, CARD_PARENT.name);
    let parentNumber = CARD_PARENT.number;

    if (!parent) {
      if (amex.account_number === AMEX.currentNumber) {
        const n = await postings(amex.id);
        log.push(`  Amex ${amex.account_number} posted lines: ${n}`);
        if (n === 0) {
          await patch(amex.id, `Amex ${AMEX.currentNumber} -> ${AMEX.newNumber}`, { account_number: AMEX.newNumber });
        } else {
          parentNumber = CARD_PARENT.fallbackNumber; // posted history: keep 2500, only set its parent
          log.push(`  Amex has posted history — number kept; parent takes ${parentNumber}`);
        }
      }
      if (byNumber(all, parentNumber) && byNumber(all, parentNumber)!.id !== amex.id) {
        throw new Error(`account number ${parentNumber} is taken by "${byNumber(all, parentNumber)!.account_name}"`);
      }
      const id = await create({
        account_number: parentNumber,
        account_name: CARD_PARENT.name,
        account_type: "Liability",
        account_subtype: SUBTYPE_CARD,
        is_postable: false,
        currency_code: "USD",
        notes: "Parent of every company credit-card liability. ROUND 441, owner 2026-10-07.",
      });
      parent = { id, account_number: parentNumber, account_name: CARD_PARENT.name, parent_account_id: null, is_postable: false, deactivated_at: null };
    } else {
      log.push(`  "${CARD_PARENT.name}" already exists (${parent.account_number}) — kept`);
    }

    all = execute ? await accounts() : all;
    const amexNow = byName(all, AMEX.name)!;
    if (amexNow.parent_account_id !== parent.id) await patch(amexNow.id, `Amex parent -> ${CARD_PARENT.name}`, { parent_account_id: parent.id });
    else log.push(`  Amex already under ${CARD_PARENT.name}`);

    const citi = byName(all, CITI.name);
    if (!citi) {
      await create({
        account_number: CITI.number,
        account_name: CITI.name,
        account_type: "Liability",
        account_subtype: SUBTYPE_CARD,
        parent_account_id: execute ? parent.id : undefined,
        is_postable: true,
        currency_code: "USD",
        notes: "Citi card ending 1345. ROUND 441, owner 2026-10-07.",
      });
    } else if (citi.parent_account_id !== parent.id) {
      await patch(citi.id, `Citi parent -> ${CARD_PARENT.name}`, { parent_account_id: parent.id });
    } else {
      log.push(`  "${CITI.name}" already exists under ${CARD_PARENT.name}`);
    }

    const dreamline = byNumber(all, DREAMLINE.number);
    if (dreamline && dreamline.account_name === DREAMLINE.name && dreamline.parent_account_id !== parent.id) {
      await patch(dreamline.id, `Dreamline 2510 parent -> ${CARD_PARENT.name} (number kept)`, { parent_account_id: parent.id });
    } else if (dreamline) {
      log.push(`  Dreamline 2510 already under ${CARD_PARENT.name}`);
    }

    // ---------------- A2: related-party subs under 2410 ----------------
    const related = byNumber(all, RELATED_PARENT.number);
    if (!related || related.account_name !== RELATED_PARENT.name) throw new Error(`${RELATED_PARENT.number} "${RELATED_PARENT.name}" not found`);
    for (const sub of RELATED_SUBS) {
      const existing = byName(all, sub.name);
      if (existing) {
        log.push(`  "${sub.name}" already exists (${existing.account_number}) — kept`);
        continue;
      }
      if (byNumber(all, sub.number)) throw new Error(`account number ${sub.number} is taken by "${byNumber(all, sub.number)!.account_name}"`);
      await create({
        account_number: sub.number,
        account_name: sub.name,
        account_type: "Liability",
        account_subtype: SUBTYPE_LOAN,
        parent_account_id: related.id,
        is_postable: true,
        currency_code: "USD",
        notes: "Related-party loan, classified separately. ROUND 441, owner 2026-10-07.",
      });
    }

    // ---------------- A4: proof ----------------
    const proof = await read<Record<string, string>>(
      `SELECT a.account_number, a.account_name, a.account_type, a.account_subtype, a.is_postable::text AS postable,
              COALESCE(p.account_number || ' ' || p.account_name, '(none)') AS parent
         FROM catalogs.accounts a LEFT JOIN catalogs.accounts p ON p.id = a.parent_account_id
        WHERE a.operating_company_id = $1::uuid AND a.deactivated_at IS NULL
          AND (a.account_number IN ('2490','2500','2510','2410') OR a.account_number LIKE '2500-00-%' OR a.account_number LIKE '2410-00-%')
        ORDER BY a.account_number`,
      [oc]
    );
    log.push("", "account_number | account_name | type | subtype | postable | parent");
    for (const r of proof) log.push(`${r.account_number} | ${r.account_name} | ${r.account_type} | ${r.account_subtype} | ${r.postable} | ${r.parent}`);
  } finally {
    await app.close();
    await pool.end();
  }
  console.log(log.join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
