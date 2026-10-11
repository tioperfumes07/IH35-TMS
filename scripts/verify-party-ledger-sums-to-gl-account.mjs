#!/usr/bin/env node
/**
 * verify-party-ledger-sums-to-gl-account — RULING 443.65 #2d (443.59 order item 8), CC-3.
 *
 * The party ledger the owner reads must be the GL account, line for line. And a posting on a party's account must name
 * its party.
 *
 * STATIC (every run, no database):
 *   RULE 1 — the endpoint's query is ONE constant (PARTY_LEDGER_SQL between markers in party-ledger.service.ts) and the
 *            routes serve parties / party-ledger / post / pair from it — the live rule below runs that exact text.
 *   RULE 2 — the posting-line writer refuses a line on a "Due to / from" account with no entity
 *            (RelatedPartyPostingWithoutPartyError), and the party writers refuse an entry without its party vendor /
 *            source document (create-entry: party_entry_requires_party_vendor, party_paid_vendor_requires_source_document;
 *            poster: party_entity_missing).
 *   RULE 3 — one engine (443.65 a): entry b is CC-2's Relay deposit poster; no party_relay_funded target type and no
 *            fee_cents / fee_account_id in the related-party engine.
 * LIVE (read only):
 *   RULE 4 — for every "Due to / from <party>" account of every company: the endpoint query's lines = the GL account's
 *            postings (same count) and its last running balance = an independent SUM over the GL. Printed per party.
 *   RULE 5 — 0 postings on a party account without an entity.
 *   LISTED (owner, not a failure): a posting on one party's account whose entity is another party's vendor.
 * --selftest exercises every rule against planted fixtures.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the party ledger is live GL — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-party-ledger-sums-to-gl-account";
const DIR = "apps/backend/src/accounting/related-party-loan-posting";
const FILES = {
  ledger: `${DIR}/party-ledger.service.ts`,
  routes: `${DIR}/routes.ts`,
  poster: `${DIR}/party-entry-post.service.ts`,
  create: `${DIR}/create-entry.service.ts`,
  writer: "apps/backend/src/accounting/posting-line-writer.ts",
};

export function extractLedgerSql(src) {
  const part = src.split("/* PARTY_LEDGER_SQL:BEGIN */")[1]?.split("/* PARTY_LEDGER_SQL:END */")[0];
  if (!part) return null;
  const m = /PARTY_LEDGER_SQL\s*=\s*`([\s\S]*?)`;/.exec(part);
  return m ? m[1] : null;
}

export function staticFailures(src) {
  const f = [];
  const sql = extractLedgerSql(src.ledger);
  if (!sql) f.push(`RULE 1 ${FILES.ledger}: no PARTY_LEDGER_SQL between the markers`);
  else if (!/running_balance_cents/.test(sql) || !/pair_status/.test(sql) || !/bank_line_description/.test(sql) || !/document/.test(sql))
    f.push(`RULE 1 ${FILES.ledger}: PARTY_LEDGER_SQL lacks running balance / pair / bank line / document`);
  for (const route of ["/related-party-loans/parties", "/related-party-loans/party-ledger/:accountId", "/related-party-loans/:id/post", "/related-party-loans/:id/pair"])
    if (!src.routes.includes(route)) f.push(`RULE 1 ${FILES.routes}: route ${route} missing`);
  if (!/getPartyLedger\(/.test(src.routes)) f.push(`RULE 1 ${FILES.routes}: the ledger routes do not use getPartyLedger`);
  if (!/throw new RelatedPartyPostingWithoutPartyError/.test(src.writer) || !/Due to \/ from %/.test(src.writer))
    f.push(`RULE 2 ${FILES.writer}: the writer does not refuse a "Due to / from" line without an entity`);
  if (!/party_entry_requires_party_vendor/.test(src.create) || !/party_paid_vendor_requires_source_document/.test(src.create))
    f.push(`RULE 2 ${FILES.create}: party entries are not refused without their party vendor / source document`);
  if (!/refuse\("party_entity_missing"\)/.test(src.poster)) f.push(`RULE 2 ${FILES.poster}: the poster does not refuse a missing party entity`);
  for (const [k, s] of Object.entries(src))
    if (/party_relay_funded|fee_cents|fee_account_id/.test(k === "writer" ? "" : s))
      f.push(`RULE 3 ${FILES[k]}: a second Relay path (party_relay_funded / fee_cents / fee_account_id) — entry b is CC-2's Relay deposit poster`);
  return f;
}

export function liveFailures(parties, nullEntity) {
  const f = [];
  for (const p of parties) {
    if (p.ledger_lines !== p.gl_lines) f.push(`RULE 4 ${p.account_number} ${p.party}: ledger shows ${p.ledger_lines} line(s), GL has ${p.gl_lines}`);
    if (p.ledger_balance !== p.gl_balance) f.push(`RULE 4 ${p.account_number} ${p.party}: ledger balance ${p.ledger_balance} != GL ${p.gl_balance}`);
  }
  for (const r of nullEntity) f.push(`RULE 5 posting ${r.id} on ${r.account_number} has no party entity`);
  return f;
}

const fmt = (c) => `${c >= 0 ? "Cr" : "Dr"} ${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

async function measure(client, sql) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const accts = (
    await client.query(
      `SELECT a.id::text, a.account_number, a.account_name, a.operating_company_id::text AS co
         FROM catalogs.accounts a WHERE a.deactivated_at IS NULL AND a.account_name LIKE 'Due to / from %'
        ORDER BY a.operating_company_id, a.account_number`
    )
  ).rows;
  const parties = [];
  for (const a of accts) {
    const lines = (await client.query(sql, [a.id, a.co])).rows;
    const gl = (
      await client.query(
        `SELECT count(*)::int AS n,
                COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS bal
           FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL AND je.status = 'posted'
          WHERE p.account_id = $1::uuid AND p.operating_company_id = $2::uuid`,
        [a.id, a.co]
      )
    ).rows[0];
    parties.push({
      account_number: a.account_number,
      party: a.account_name.replace(/^Due to \/ from /, ""),
      ledger_lines: lines.length,
      gl_lines: Number(gl.n),
      ledger_balance: lines.length ? Number(lines[lines.length - 1].running_balance_cents) : 0,
      gl_balance: Number(gl.bal),
      unpaired: lines.filter((l) => l.pair_status === "unpaired").length,
    });
  }
  const nullEntity = (
    await client.query(
      `SELECT p.id::text, a.account_number FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id = p.account_id AND a.account_name LIKE 'Due to / from %'
        WHERE p.entity_uuid IS NULL`
    )
  ).rows;
  const crossParty = (
    await client.query(
      `SELECT p.id::text, a.account_number, v.vendor_name, je.entry_date::text AS date, p.amount_cents::bigint AS cents
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL
         JOIN catalogs.accounts a ON a.id = p.account_id AND a.account_name LIKE 'Due to / from %'
         JOIN mdata.vendors v ON v.id = p.entity_uuid
        WHERE p.entity_type = 'vendor'
          AND v.vendor_name NOT ILIKE substr(a.account_name, length('Due to / from ') + 1) || '%'
          AND EXISTS (SELECT 1 FROM catalogs.accounts o
                       WHERE o.operating_company_id = a.operating_company_id AND o.id <> a.id
                         AND o.account_name LIKE 'Due to / from %'
                         AND v.vendor_name ILIKE substr(o.account_name, length('Due to / from ') + 1) || '%')`
    )
  ).rows;
  await client.query("ROLLBACK");
  return { parties, nullEntity, crossParty };
}

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, readFileSync(join(ROOT, rel), "utf8")]));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const real = readSources();
    const plant = (k, s) => ({ ...real, [k]: s });
    const cases = [
      ["the real sources pass the static rules", staticFailures(real).length === 0],
      ["the ledger query is extracted from the service", (extractLedgerSql(real.ledger) ?? "").includes("running_balance_cents")],
      ["no ledger constant fails RULE 1", staticFailures(plant("ledger", "export const X = 1;")).some((x) => x.startsWith("RULE 1"))],
      ["a missing pair route fails RULE 1", staticFailures(plant("routes", real.routes.replace("/related-party-loans/:id/pair", "/x"))).some((x) => x.startsWith("RULE 1"))],
      ["a writer without the party refusal fails RULE 2", staticFailures(plant("writer", real.writer.replace(/throw new RelatedPartyPostingWithoutPartyError/g, "void 0"))).some((x) => x.startsWith("RULE 2"))],
      ["a create writer that skips the party vendor fails RULE 2", staticFailures(plant("create", real.create.replace(/party_entry_requires_party_vendor/g, "x"))).some((x) => x.startsWith("RULE 2"))],
      ["a poster that skips the entity check fails RULE 2", staticFailures(plant("poster", real.poster.replace(/refuse\("party_entity_missing"\)/g, "null"))).some((x) => x.startsWith("RULE 2"))],
      ["a second Relay path (party_relay_funded / fee_cents) fails RULE 3", staticFailures(plant("create", real.create + "\n// party_relay_funded fee_cents")).some((x) => x.startsWith("RULE 3"))],
      ["ledger = GL passes", liveFailures([{ account_number: "2410-00-001", party: "J", ledger_lines: 16, gl_lines: 16, ledger_balance: 269750, gl_balance: 269750 }], []).length === 0],
      ["a ledger that drops a GL line fails RULE 4", liveFailures([{ account_number: "2410-00-001", party: "J", ledger_lines: 15, gl_lines: 16, ledger_balance: 269750, gl_balance: 269750 }], []).some((x) => x.startsWith("RULE 4"))],
      ["a ledger balance off the GL fails RULE 4", liveFailures([{ account_number: "2410-00-001", party: "J", ledger_lines: 16, gl_lines: 16, ledger_balance: 269700, gl_balance: 269750 }], []).some((x) => x.startsWith("RULE 4"))],
      ["a party posting without an entity fails RULE 5", liveFailures([], [{ id: "p1", account_number: "2410-00-001" }]).some((x) => x.startsWith("RULE 5"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const src = readSources();
  const sf = staticFailures(src);
  const sql = extractLedgerSql(src.ledger);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    let lf = [];
    let m = null;
    if (sql) {
      try {
        m = await measure(client, sql);
        lf = liveFailures(m.parties, m.nullEntity);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        lf = [`RULE 4 the live check could not run — ${err?.code ? `SQLSTATE ${err.code} ` : ""}${err?.message ?? err}`];
      }
    }
    if (m) {
      for (const p of m.parties)
        console.log(`  ${p.account_number} ${p.party}: ledger ${p.ledger_lines} line(s) = GL ${p.gl_lines}; balance ${fmt(p.ledger_balance)} (GL ${fmt(p.gl_balance)}); unpaired ${p.unpaired}`);
      for (const x of m.crossParty)
        console.log(`  LISTED (owner): posting ${x.id} on ${x.account_number} ${x.date} ${(Number(x.cents) / 100).toFixed(2)} names ${x.vendor_name} — another party's vendor`);
    }
    const all = [...sf, ...lf];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${m?.parties.length ?? 0} party account(s), every ledger = its GL account; 0 party postings without an entity.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
