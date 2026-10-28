#!/usr/bin/env node
/**
 * verify-every-load-born-posting-carries-its-load — ROUND 363-CC1-A (LAW 363.2), CC-1.
 *
 * The load a GL line belongs to is stamped on the posting, by the poster, in the same INSERT
 * (accounting.journal_entry_postings.load_id = accounting.posting_source_load_id(...), migration 202615350500).
 *
 * STATIC (every run, no database):
 *   RULE 1 — every `INSERT INTO accounting.journal_entry_postings` in apps/backend/src names the load_id column, and
 *            its value is either the resolver `accounting.posting_source_load_id(` or a literal NULL that the same
 *            statement explains with "NULL by design" (a posting whose source has no load: recurring template,
 *            period close, reconciliation variance). A poster that does not name the column is the defect —
 *            it would leave a load-born posting unstamped.
 * LIVE (USMCA plus NULL-company violations, read-only):
 *   RULE 2 — every posting created since 202615350500 applied carries exactly the load its resolver names
 *            (stamp = accounting.posting_source_load_id(type, id, line, reversal_of)). Ceiling 0. This proves the
 *            writers, not the history: pre-existing rows are CC-3's provable backfill (363-CC3-A).
 *   RULE 3 (static, RULING 443.64 #2, CC-3) — every scalar subquery in the newest definition of
 *            accounting.posting_source_load_id is single-row by construction: it looks its row up by a primary key
 *            (`<alias>.id = p_…`) or it aggregates / LIMITs. 202615520300 added a Relay fallback keyed on
 *            fuel.fuel_transactions.relay_fuel_transaction_id, which is not unique (one Relay fill = 2 fuel rows, 73 on
 *            prod); the subquery raised "more than one row returned by a subquery" and this guard crashed on every live
 *            run instead of reporting. Fixed in 202615580900; this rule keeps a non-unique lookup from coming back.
 *   A live query that errors is a FAIL with the database's message, never a stack trace that guards nothing.
 *   A multi-load settlement's per-load pay-run leg is expected to carry a load its own settlement lines name (443.64).
 *   It also prints the two counts the Lead asked for — postings whose source resolves to a load, and of those the
 *   count with load_id written — so the backfill's progress is visible every run.
 * --selftest exercises both rules against fixtures.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the load stamp is live ledger lineage — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-every-load-born-posting-carries-its-load";
const MIGRATION = "202615350500_journal_entry_postings_load_id_stamp.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const INSERT_RE = /INSERT\s+INTO\s+accounting\.journal_entry_postings\b/gi;

/** The SQL statement text (template literal) that starts at each posting INSERT in `src`. */
export function postingInserts(src) {
  const out = [];
  for (const m of src.matchAll(INSERT_RE)) {
    // A comment that MENTIONS the insert is not one (the r391 writer's header prose tripped RULE 1).
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(lineStart, m.index))) continue;
    const end = src.indexOf("`", m.index);
    out.push(src.slice(m.index, end === -1 ? undefined : end));
  }
  return out;
}

export function staticFailures(files) {
  const failures = [];
  let inserts = 0;
  for (const { rel, src } of files) {
    for (const stmt of postingInserts(src)) {
      inserts++;
      const cut = stmt.search(/\bVALUES\b|\bSELECT\b/i);
      const names = /\bload_id\b/.test(cut === -1 ? stmt : stmt.slice(0, cut));
      const resolver = /accounting\.posting_source_load_id\s*\(/.test(stmt);
      const byDesign = /NULL by design/i.test(stmt);
      if (!names) failures.push(`RULE 1 ${rel}: a posting INSERT does not write load_id`);
      else if (!resolver && !byDesign) failures.push(`RULE 1 ${rel}: load_id is written but neither by accounting.posting_source_load_id() nor as a stated "NULL by design"`);
    }
  }
  return { failures, inserts };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "__tests__") continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") && !/\.test\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

const RESOLVER_RE = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+accounting\.posting_source_load_id\s*\(/i;

/** Each `(SELECT …)` in `body`, up to its matching close paren. */
export function scalarSubqueries(body) {
  const out = [];
  for (const m of body.matchAll(/\(\s*SELECT\b/gi)) {
    let depth = 0;
    for (let i = m.index; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")" && --depth === 0) { out.push(body.slice(m.index, i + 1)); break; }
    }
  }
  return out;
}

/** RULE 3: a resolver lookup that can match several rows (keyed on a non-id column, no aggregate, no LIMIT). */
export function resolverFailures(rel, sql) {
  const failures = [];
  const start = sql.search(RESOLVER_RE);
  const tag = start === -1 ? null : /\$(\w*)\$/.exec(sql.slice(start));
  const open = tag ? start + tag.index + tag[0].length : -1;
  const close = tag ? sql.indexOf(tag[0], open) : -1;
  if (open === -1 || close === -1) return [`RULE 3 ${rel}: no dollar-quoted body for accounting.posting_source_load_id`];
  for (const sub of scalarSubqueries(sql.slice(open, close))) {
    const where = sub.slice(sub.search(/\bWHERE\b/i));
    const keys = [...where.matchAll(/\b(\w+)\.(\w+)(?:::\w+)?\s*=\s*(?:[\w.]+\(\s*)?p_\w+/g)].map((k) => k[2]);
    const singleRow = /\b(count|array_agg|min|max|bool_and|bool_or|sum)\s*\(|\bLIMIT\s+1\b/i.test(sub);
    const nonUnique = keys.filter((k) => k !== "id");
    if (keys.length === 0) failures.push(`RULE 3 ${rel}: resolver lookup has no p_ key — cannot prove it single-row: ${sub.replace(/\s+/g, " ").slice(0, 120)}`);
    else if (nonUnique.length && !keys.includes("id") && !singleRow) {
      failures.push(`RULE 3 ${rel}: resolver lookup keyed on non-unique ${nonUnique.join(", ")} returns several rows (SQLSTATE 21000) — aggregate or key it on id: ${sub.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return failures;
}

export function newestResolverMigration() {
  const dir = join(ROOT, "db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(dir, files[i]), "utf8");
    if (RESOLVER_RE.test(sql)) return { rel: `db/migrations/${files[i]}`, sql };
  }
  return null;
}

/** 443.110 G8 — the factoring lifecycle source types whose load is their factoring advance's (posting-line-writer.ts). */
export const FACTORING_EVENT_TYPES = ["factoring_customer_payment", "factoring_reserve_release", "factoring_chargeback", "factoring_default_interest", "factoring_advance_deposit"];
const FACTORING_EVENT_TYPES_SQL = FACTORING_EVENT_TYPES.map((t) => `'${t}'`).join(", ");
export const WRITER = "apps/backend/src/accounting/posting-line-writer.ts";
// ENG-28: read-only source resolvers stay in the leaf; insertion and fail-closed
// source/load validation now belong to the full engine. Check both actual homes.
const readWriterControls = () => readFileSync(join(ROOT, WRITER), "utf8") + "\n" +
  readFileSync(join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts"), "utf8");

/**
 * RULE 4 (static, 443.110 G8) — the ONE posting writer derives a posting's load from its source document when the
 * caller did not pass one, and only ever its OWN company's load:
 *   (a) every factoring lifecycle event type resolves to its advance's source_load_id, scoped to the company;
 *   (b) the INSERT's derived load is accepted only when mdata.loads says it is this company's load;
 *   (c) a caller passing another company's load is refused (PostingLoadOfAnotherCompanyError);
 *   (d) a bank_categorization posting names its party (categorized vendor / driver) — the entity is the document's too.
 */
export function writerFailures(src) {
  const f = [];
  const list = /FACTORING_EVENT_SOURCE_TYPES\s*=\s*\[([\s\S]*?)\]/.exec(src)?.[1] ?? "";
  for (const t of FACTORING_EVENT_TYPES) if (!list.includes(`"${t}"`)) f.push(`RULE 4 ${WRITER}: factoring event ${t} no longer derives its advance's load`);
  if (!/FROM accounting\.factoring_advances WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(src)) f.push(`RULE 4 ${WRITER}: the factoring advance load lookup is not company-scoped`);
  if (!/sl\.id = accounting\.posting_source_load_id\([\s\S]{0,120}?sl\.operating_company_id = \$1::uuid/.test(src)) f.push(`RULE 4 ${WRITER}: a derived load is stamped without checking it is the posting's company's load`);
  if (!/throw new PostingLoadOfAnotherCompanyError\(/.test(src)) f.push(`RULE 4 ${WRITER}: a caller-passed load of another company is no longer refused`);
  if (!/bank_categorization:\s*`SELECT COALESCE\(categorization_vendor_id::text, categorization_driver_id::text\)/.test(src)) f.push(`RULE 4 ${WRITER}: a bank_categorization posting no longer names its categorized party`);
  return f;
}

/**
 * RULE 5 (static, LEAD 443.113 I-02) — the entity invariant is universal: every posting source type the backend writes
 * is CLASSIFIED in the writer (PARTY_FROM_DOCUMENT / PARTYLESS), an unclassified type is refused, and every
 * PARTY_FROM_DOCUMENT type has a party derivation in resolvePostingSourceEntity. Source types are the posting engine's POSTING_SOURCE_TYPES plus
 * every `source_transaction_type: "<literal>"` in non-test backend code.
 */
export function classifiedTypes(writer) {
  const grab = (name) => [...((new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(writer)?.[1]) ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  return new Set([...grab("PARTY_FROM_DOCUMENT_SOURCE_TYPES"), ...grab("PARTYLESS_SOURCE_TYPES")]);
}
export function writtenSourceTypes(files, engineSrc) {
  // Comments inside the list quote account roles (e.g. "cash_clearing"); only the entries count.
  const list = (/POSTING_SOURCE_TYPES = \[([\s\S]*?)\] as const/.exec(engineSrc)?.[1] ?? "").replace(/\/\/.*$/gm, "");
  const out = new Set([...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
  for (const f of files) {
    if (/__tests__|\.test\.ts$/.test(f.rel)) continue;
    for (const m of f.src.matchAll(/source_transaction_type:\s*["']([a-z_]+)["']/g)) out.add(m[1]);
  }
  return out;
}
export function partyFailures(writer, written) {
  const f = [];
  const known = classifiedTypes(writer);
  for (const t of written) if (!known.has(t)) f.push(`RULE 5 ${WRITER}: posting source type "${t}" is written but not classified for its party`);
  if (!/=== "unclassified"\) \{\s*throw new UnclassifiedPostingSourceTypeError\(/.test(writer)) f.push(`RULE 5 ${WRITER}: an unclassified source type is no longer refused`);
  const fromDoc = [...((/PARTY_FROM_DOCUMENT_SOURCE_TYPES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(writer)?.[1]) ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const derivation = writer.slice(writer.indexOf("export async function resolvePostingSourceEntity"), writer.indexOf("async function relayVendorId"));
  for (const t of fromDoc) {
    if (t === "related_party_loan") continue; // its poster stamps the party itself (party-entry-post.service.ts)
    if (!new RegExp(`(\\b${t}:\\s*\`SELECT|"${t}")`).test(derivation)) f.push(`RULE 5 ${WRITER}: PARTY_FROM_DOCUMENT type "${t}" has no party derivation in resolvePostingSourceEntity`);
  }
  return f;
}

export function run() {
  const files = walk(join(ROOT, "apps/backend/src")).map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, "utf8") }));
  const { failures, inserts } = staticFailures(files);
  if (inserts === 0) failures.push("RULE 1: found 0 posting INSERTs under apps/backend/src — the matcher is stale");
  const resolver = newestResolverMigration();
  if (!resolver) failures.push("RULE 3: no migration defines accounting.posting_source_load_id — the matcher is stale");
  else failures.push(...resolverFailures(resolver.rel, resolver.sql));
  failures.push(...writerFailures(readWriterControls()));
  failures.push(...partyFailures(readWriterControls(),
    writtenSourceTypes(files, readFileSync(join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts"), "utf8"))));
  return { failures, inserts, resolver: resolver?.rel };
}

export function liveFailures({ mismatched, null_company = 0 }) {
  return [
    ...(null_company > 0 ? [`RULE 2 ${null_company} posting(s) have NULL operating_company_id`] : []),
    ...mismatched.map((r) => `RULE 2 posting ${r.id} (${r.source_transaction_type} ${r.source_transaction_id}) stamp=${r.load_id ?? "NULL"} source says ${r.expected ?? "NULL"}`),
  ];
}

export function liveErrorFailures(err) {
  return [`RULE 2 the live check could not run — ${err?.code ? `SQLSTATE ${err.code} ` : ""}${err?.where ? `(${err.where}) ` : ""}${err?.message ?? err}`];
}

export async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const applied = (await client.query(`SELECT applied_at FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION])).rows[0];
  if (!applied) { await client.query("ROLLBACK"); return null; }
  const rows = (await client.query(`
    WITH p AS (
      -- ROUND 393.2 (CC-2): a leg of a reclass-BY-LOAD entry is expected to carry the load the reclassify engine recorded
      -- for it in accounting.reclassify_batch_lines (from_load_id on the leg that takes the line off its old load,
      -- to_load_id on the leg that puts it on the new one; the undo entry the other way round). Every other posting is
      -- expected to carry what its source resolves to. Same strictness, read from the engine's own record.
      SELECT jep.id, jep.operating_company_id, jep.source_transaction_type, jep.source_transaction_id, jep.load_id, jep.created_at,
             COALESCE(rc.expected_load, mv.moved_from_load, sb.sibling_from_load, rp.pair_load, accounting.posting_source_load_id(jep.source_transaction_type, jep.source_transaction_id, jep.source_transaction_line_id, jep.reversal_of_line_id), sx.line_load, fx.doc_load) AS expected
        FROM accounting.journal_entry_postings jep
        -- 443.110 G8 (RULE 4): a factoring lifecycle event is sourced by its factoring advance and carries the advance's
        -- load; a Faro reserve entry tied to a Faro invoice carries that invoice's load. Same company, never a guess.
        LEFT JOIN LATERAL (
          SELECT CASE
                   WHEN jep.reversal_of_line_id IS NULL AND jep.source_transaction_type IN (${FACTORING_EVENT_TYPES_SQL}) THEN
                     (SELECT fa.source_load_id FROM accounting.factoring_advances fa
                       WHERE fa.id::text = jep.source_transaction_id AND fa.operating_company_id = jep.operating_company_id)
                   WHEN jep.reversal_of_line_id IS NULL AND jep.source_transaction_type = 'faro_reserve_entry' THEN
                     (SELECT CASE WHEN count(DISTINCT i.source_load_id) = 1 THEN (array_agg(i.source_load_id))[1] END
                        FROM accounting.faro_reserve_entries e
                        JOIN accounting.factoring_purchase_lines pl ON pl.operating_company_id = e.operating_company_id
                         AND pl.faro_invoice_number = e.faro_invoice_number AND pl.voided_at IS NULL
                        JOIN accounting.invoices i ON i.id = pl.invoice_id AND i.operating_company_id = pl.operating_company_id
                       WHERE e.id::text = jep.source_transaction_id AND e.operating_company_id = jep.operating_company_id)
                 END AS doc_load
        ) fx ON true
        -- RULING 443.64 #2 (CC-3): the resolver names a settlement's load only when the settlement covers ONE load. The
        -- pay-run close engine posts a multi-load settlement's pay / recovery legs per load (settlement-payrun-close
        -- byRoleLoad / perLoad), each leg carrying the load of its own settlement line. Such a leg is expected to carry a
        -- load that settlement's own lines name — read from the engine's record, never "any load". Measured on prod
        -- 2026-10-11: 263 of 263 such legs name a load on their settlement's lines (64 settlements), 0 name another load.
        LEFT JOIN LATERAL (
          SELECT jep.load_id AS line_load
           WHERE jep.source_transaction_type IN ('driver_settlement', 'settlement') AND jep.load_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl
                          WHERE sl.operating_company_id = jep.operating_company_id
                            AND sl.settlement_id::text = jep.source_transaction_id AND sl.load_id = jep.load_id)
        ) sx ON true
        -- LEAD 443.192 (CC-3, 6 rows after the fuel re-attribution): a line already REVERSED (a fully reversed pair nets to zero
        -- and can never be reclassified) is expected to carry its own reversal's load — the pair stays consistent where it was
        -- booked. Measured: 2 Relay fills' 10-12 originals (443.129 E correction) stamped 13661 / 13667 with their reversals,
        -- while the fills' live lines moved through the engine. The reversal half is checked by the resolver as before.
        LEFT JOIN LATERAL (
          SELECT r.load_id AS pair_load
            FROM accounting.journal_entry_postings r
           WHERE jep.reversed_by_line_id IS NOT NULL AND r.id = jep.reversed_by_line_id AND r.reversal_of_line_id = jep.id
             AND r.operating_company_id = jep.operating_company_id
        ) rp ON true
        -- LEAD 443.192 (CC-3): a line the reclassify engine MOVED to another load (its batch line names this posting, applied,
        -- from_load <> to_load) stays on the load it was moved FROM — the reclass entry reverses it there and posts it again on
        -- the new load, while its source document now names the new one. Read from the engine's record, never "any load".
        LEFT JOIN LATERAL (
          SELECT bl.from_load_id AS moved_from_load
            FROM accounting.reclassify_batch_lines bl
           WHERE bl.operating_company_id = jep.operating_company_id AND bl.posting_id = jep.id
             AND bl.result = 'applied' AND bl.to_load_id IS NOT NULL AND bl.to_load_id IS DISTINCT FROM bl.from_load_id
             AND jep.reversed_by_line_id IS NOT NULL
           LIMIT 1
        ) mv ON true
        -- LEAD 443.260 (CC-2, 48 rows after the 443.243 fuel moves): the reclassify engine moves a document's COST line to
        -- the new load (that line is read by mv / rc above); the same original entry's OTHER legs (e.g. the 2510 card-payable
        -- payment leg) are not reclassified and stay on the load the entry was booked on — while the source document now
        -- names the new load. Such a sibling is expected to carry the batch line's from_load, and only when that batch line
        -- moved a posting of THIS entry for THIS document from exactly this posting's load to the load the source now names.
        LEFT JOIN LATERAL (
          SELECT bl.from_load_id AS sibling_from_load
            FROM accounting.journal_entry_postings sib
            JOIN accounting.reclassify_batch_lines bl ON bl.posting_id = sib.id AND bl.operating_company_id = jep.operating_company_id
           WHERE sib.journal_entry_uuid = jep.journal_entry_uuid AND sib.id <> jep.id
             AND sib.source_transaction_id = jep.source_transaction_id
             AND bl.result = 'applied' AND bl.to_load_id IS NOT NULL AND bl.to_load_id IS DISTINCT FROM bl.from_load_id
             AND bl.from_load_id = jep.load_id
             AND bl.to_load_id = accounting.posting_source_load_id(jep.source_transaction_type, jep.source_transaction_id, jep.source_transaction_line_id, jep.reversal_of_line_id)
           LIMIT 1
        ) sb ON true
        LEFT JOIN LATERAL (
          SELECT CASE
                   WHEN bl.reclass_journal_entry_id = jep.journal_entry_uuid
                     THEN CASE WHEN jep.debit_or_credit = bl.debit_or_credit THEN bl.to_load_id ELSE bl.from_load_id END
                   ELSE CASE WHEN jep.debit_or_credit = bl.debit_or_credit THEN bl.from_load_id ELSE bl.to_load_id END
                 END AS expected_load
            FROM accounting.reclassify_batch_lines bl
           WHERE bl.operating_company_id = jep.operating_company_id AND bl.to_load_id IS NOT NULL
             AND (bl.reclass_journal_entry_id = jep.journal_entry_uuid OR bl.undo_journal_entry_id = jep.journal_entry_uuid)
             AND bl.source_transaction_id = jep.source_transaction_id
             AND bl.amount_cents = jep.amount_cents
             -- LEAD 443.260 (CC-2): a load move reclassifies EVERY leg of the line (cost AND its card-payable leg), one batch
             -- line each, same amount — the leg's own batch line is the one on its own account, not whichever comes first.
             AND (bl.from_account_id = jep.account_id OR bl.to_account_id = jep.account_id)
           ORDER BY (bl.from_account_id = jep.account_id AND bl.to_account_id = jep.account_id) DESC
           LIMIT 1
        ) rc ON true
       WHERE (jep.operating_company_id = $2::uuid OR jep.operating_company_id IS NULL))
    SELECT
      (SELECT count(*) FROM p WHERE operating_company_id IS NULL)::int AS null_company,
      (SELECT count(*) FROM p WHERE expected IS NOT NULL)::int                         AS load_born,
      (SELECT count(*) FROM p WHERE expected IS NOT NULL AND load_id IS NOT NULL)::int AS stamped,
      (SELECT count(*) FROM p WHERE created_at >= $1)::int                             AS since,
      (SELECT coalesce(json_agg(x), '[]') FROM (
         SELECT id, source_transaction_type, source_transaction_id, load_id, expected FROM p
          WHERE created_at >= $1 AND load_id IS DISTINCT FROM expected LIMIT 50) x)    AS mismatched`, [applied.applied_at, USMCA])).rows[0];
  await client.query("ROLLBACK");
  return { ...rows, appliedAt: applied.applied_at };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const ok = "q(`INSERT INTO accounting.journal_entry_postings (a, load_id) VALUES ($1, accounting.posting_source_load_id($8::text, $9::text))`)";
    const nul = "q(`INSERT INTO accounting.journal_entry_postings (a, load_id)\n -- period close: NULL by design.\n VALUES ($1, NULL)`)";
    const missing = "q(`INSERT INTO accounting.journal_entry_postings (a, b) VALUES ($1, $2)`)";
    const silentNull = "q(`INSERT INTO accounting.journal_entry_postings (a, load_id) VALUES ($1, NULL)`)";
    const f = (src) => staticFailures([{ rel: "x.ts", src }]).failures;
    const fn = (sub) => `CREATE OR REPLACE FUNCTION accounting.posting_source_load_id(p_source_type text, p_source_id text)\n AS $function$\n SELECT CASE WHEN p_source_type = 'fuel_event' THEN ${sub} END\n$function$;`;
    const r3 = (sql) => resolverFailures("planted.sql", sql);
    const relayOld = fn("COALESCE((SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.id::text = p_source_id), (SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id))");
    const relayNew = fn("COALESCE((SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.id::text = p_source_id), (SELECT CASE WHEN count(DISTINCT d.load_id) = 1 AND count(d.load_id) = count(*) THEN (array_agg(d.load_id))[1] END FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id))");
    const cases = [
      ["resolver-stamped insert passes", f(ok).length === 0],
      ["stated NULL-by-design insert passes", f(nul).length === 0],
      ["insert without load_id fails", f(missing).some((x) => x.startsWith("RULE 1"))],
      ["unexplained NULL fails", f(silentNull).some((x) => x.startsWith("RULE 1"))],
      ["a comment that mentions the INSERT is not an insert", f("// Nine services INSERT INTO accounting.journal_entry_postings directly.\n *   INSERT INTO accounting.journal_entry_postings x\n" + ok).length === 0],
      ["a real insert after a comment is still checked", f("// note\n" + missing).some((x) => x.startsWith("RULE 1"))],
      ["live clean passes", liveFailures({ mismatched: [] }).length === 0],
      ["NULL-company money fails even without a recent mismatch", liveFailures({ mismatched: [], null_company: 1 }).length === 1],
      // RULE 3 plants the multi-row case: 202615520300's Relay fallback, keyed on the non-unique relay id.
      ["resolver lookup on a non-unique key fails (the 443.64 crash)", r3(relayOld).some((x) => x.startsWith("RULE 3") && x.includes("relay_fuel_transaction_id"))],
      ["resolver lookup on a non-unique key that aggregates passes", r3(relayNew).length === 0],
      ["resolver lookup on a non-unique key with LIMIT 1 passes", r3(fn("(SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id LIMIT 1)")).length === 0],
      ["resolver primary-key lookups pass", r3(fn("(SELECT d.load_id FROM accounting.expenses d WHERE d.id::text = p_source_id)")).length === 0],
      ["resolver join keyed on the parent id passes", r3(fn("(SELECT b.load_id FROM accounting.bill_payments d JOIN accounting.bills b ON b.id = d.bill_id WHERE d.id::text = p_source_id)")).length === 0],
      ["202615520300 on disk (the shipped crash) fails RULE 3", (() => { const rel = "db/migrations/202615520300_posting_source_load_id_relay_fill_path.sql"; return resolverFailures(rel, readFileSync(join(ROOT, rel), "utf8")).some((x) => x.includes("relay_fuel_transaction_id")); })()],
      ["the newest resolver migration on disk passes RULE 3", (() => { const m = newestResolverMigration(); return !!m && resolverFailures(m.rel, m.sql).length === 0; })()],
      ["a live query error is a FAIL line, not a crash", liveErrorFailures(new Error("more than one row returned by a subquery used as an expression")).some((x) => x.startsWith("RULE 2") && x.includes("more than one row"))],
      // RULE 4 (443.110 G8) — the real writer passes; each planted removal is caught.
      ...(() => {
        const w = readWriterControls();
        return [
          ["RULE 4: the real posting writer passes", writerFailures(w).length === 0],
          ["RULE 4: a factoring event dropped from the writer fails", writerFailures(w.replace('"factoring_chargeback",', "")).some((x) => x.includes("factoring_chargeback"))],
          ["RULE 4: an unscoped advance load lookup fails", writerFailures(w.replace("FROM accounting.factoring_advances WHERE id = $1::uuid AND operating_company_id = $2::uuid", "FROM accounting.factoring_advances WHERE id = $1::uuid")).some((x) => x.includes("company-scoped"))],
          ["RULE 4: a derived load without the company check fails", writerFailures(w.replace("AND sl.operating_company_id = $1::uuid", "")).some((x) => x.includes("derived load"))],
          ["RULE 4: dropping the foreign-load refusal fails", writerFailures(w.replace("throw new PostingLoadOfAnotherCompanyError(", "void (")).some((x) => x.includes("another company"))],
          ["RULE 4: dropping the bank_categorization party fails", writerFailures(w.replace("bank_categorization: `SELECT COALESCE(categorization_vendor_id::text", "bank_categorization: `SELECT COALESCE(NULL::text")).some((x) => x.includes("party"))],
        ];
      })(),
      // RULE 5 (443.113 I-02) — the real writer + every written source type pass; each planted regression is caught.
      ...(() => {
        const w = readWriterControls();
        const files = walk(join(ROOT, "apps/backend/src")).map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, "utf8") }));
        const written = writtenSourceTypes(files, readFileSync(join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts"), "utf8"));
        return [
          ["RULE 5: every written source type is classified (real code)", partyFailures(w, written).length === 0 && written.size > 20],
          ["RULE 5: a new poster's unclassified type fails", partyFailures(w, new Set([...written, "tst_new_poster"])).some((x) => x.includes("tst_new_poster"))],
          ["RULE 5: a type dropped from the classification fails", partyFailures(w.replace('"driver_liability", "relay_deposit",', '"relay_deposit",'), written).some((x) => x.includes("driver_liability"))],
          ["RULE 5: dropping the unclassified refusal fails", partyFailures(w.replace("throw new UnclassifiedPostingSourceTypeError(", "void ("), written).some((x) => x.includes("unclassified source type"))],
          ["RULE 5: a document-party type without a derivation fails", partyFailures(w.replace("    driver_liability: `SELECT", "    driver_liability_x: `SELECT"), written).some((x) => x.includes('"driver_liability" has no party derivation'))],
          ["RULE 5: test-only literals are not counted as written", !writtenSourceTypes([{ rel: "x/__tests__/a.test.ts", src: 'source_transaction_type: "tst_only"' }], "").has("tst_only")],
        ];
      })(),
      ["live mismatch fails", liveFailures({ mismatched: [{ id: "p1", source_transaction_type: "expense", source_transaction_id: "e1", load_id: null, expected: "l1" }] }).length === 1],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const { failures: sf, inserts } = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    let m = null;
    let lf = [];
    try {
      m = await measure(client);
      lf = m ? liveFailures(m) : [];
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      lf = liveErrorFailures(err);
    }
    // ENG-26 (443.324) — factoring_advance + driver_settlement postings missing load_id (shrink-only).
    // Baseline: 155 factoring_advance + 105 driver_settlement = 260 (measured 2026-10-24 on 1d87d07bab).
    // These are pre-stamp-migration rows. Count should only decrease as the backfill lands via the posting engine.
    // Fuel (27), expense (24), invoice (4), bank_deposit/relay_deposit: load-less by design — not counted here.
    const ENG26_BASELINE = 260;
    let eng26Count = null;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
      const r = await client.query(
        `SELECT count(*) AS n FROM accounting.journal_entry_postings
          WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
            AND load_id IS NULL
            AND source_transaction_type IN ('factoring_advance','driver_settlement')`,
      );
      await client.query("COMMIT");
      eng26Count = Number(r.rows[0].n);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      lf.push(`ENG-26 shrink-only query error: ${String(err.message ?? err)}`);
    }
    if (eng26Count !== null && eng26Count > ENG26_BASELINE) {
      lf.push(
        `ENG-26: ${eng26Count} factoring_advance/driver_settlement postings without load_id (baseline ${ENG26_BASELINE}; count grew)`,
      );
    }
    const eng26Summary = eng26Count !== null
      ? `ENG-26 shrink: ${eng26Count}/${ENG26_BASELINE} (factoring_advance+driver_settlement without load_id)`
      : "ENG-26 shrink: query failed";
    const summary = m
      ? `load-born postings ${m.load_born}, stamped ${m.stamped} (history is CC-3's provable backfill); ${m.since} posting(s) since ${MIGRATION} applied, 0 unstamped`
      : `${MIGRATION} not applied on this database yet — static rule only`;
    const all = [...sf, ...lf];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${inserts} posting INSERT(s) under apps/backend/src all write load_id; ${summary}; ${eng26Summary}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
