#!/usr/bin/env node
// ROUND 337 / 00-ROOT-CAUSE-THE-SPINE-LIVES-IN-THE-WRONG-PLACE (CC-2) — every posting carries its spine link.
//
// MEASURED 2026-10-03 (USMCA, posted entries): 3,908 postings have no accounting.transaction_source_links row —
// 3,860 expense + 48 invoice — and the bus read that as a poster that never writes the link. It is not:
//   * accounting/posting-engine.service.ts insertPostingLines writes the link INSIDE the same loop that inserts each
//     posting (and its reversal path does the same); accounting/void.service.ts writes a 'reversal_of' link per
//     reversal leg. Every posting whose source document still exists is linked: 0 of 7,909 are not.
//   * All 3,908 belong to 987 documents (963 expenses, 24 invoices) that NO LONGER EXIST. The AUTH-177 purge
//     (2026-09-30 17:19:10 and 17:28:12, owner_purge_voided_and_sample) deleted those voided documents AND their
//     3,908 links in one transaction each, and left each document's original + reversal entries posted: 1,930 + 1,930
//     expense legs, net $0.00; 48 invoice reversal legs, net $0.00. 963 docs x 2 entries = the bus's 1,926 entries.
// So the writer at fault is the purge (a document deleted, its GL pair stranded), not the poster. This guard holds both:
//   CODE  the three writers keep writing the link on the same client, in the same loop as the posting insert.
//   LIVE  (a) an unlinked posting whose source document EXISTS — ceiling 0 (a writer that forgot the spine).
//         (b) an unlinked posting whose document was purged (stranded GL) — committed ceiling, shrink-only, and the
//             stranded population must net to zero; it clears when the governed purge removes the voided pairs.
// Fail-closed: no DATABASE_URL is a FAIL. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "reads accounting.journal_entry_postings against accounting.transaction_source_links";

const LABEL = "verify-every-posting-has-a-spine-link";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  engine: "apps/backend/src/accounting/posting-engine.service.ts",
  voidSvc: "apps/backend/src/accounting/void.service.ts",
  writer: "apps/backend/src/accounting/posting-line-writer.ts",
};
/** COMMITTED ceiling (shrink-only): postings stranded by the AUTH-177 purge, by source type. Measured 2026-10-03. */
export const STRANDED_CEILING = { expense: 3860, invoice: 48 };
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

/** ROUND 391: the ONE writer inserts the posting, then its spine row, on the caller's client — nothing in between can skip it. */
export function writerGaps(writer) {
  const f = [];
  const fn = writer.match(/async function writeLine\([\s\S]*?\n\}\n/);
  if (!fn) return [`${FILES.writer}: writeLine (the one insert path) not found`];
  const body = fn[0];
  const post = body.indexOf("INSERT INTO accounting.journal_entry_postings");
  const link = body.indexOf("INSERT INTO accounting.transaction_source_links");
  if (post < 0 || link < 0 || post > link) f.push(`${FILES.writer}: must insert the posting and THEN its transaction_source_links row`);
  if (!/await client\.query[\s\S]{0,40}INSERT INTO accounting\.transaction_source_links/.test(body)) f.push(`${FILES.writer}: the link must be written on the caller's client (same transaction)`);
  if (!/if \(!line\.source_transaction_type \|\| !line\.source_transaction_id\)\s*\{[\s\S]{0,400}throw new Error/.test(body)) f.push(`${FILES.writer}: a line with no source must be refused`);
  return f;
}

export function check({ engine, voidSvc, writer = "" }) {
  const f = [];
  const fn = engine.match(/async function insertPostingLines\([\s\S]*?\n\}\n/);
  const viaWriter = Boolean(fn && /insertPostingLinesWithSpine\(\s*input\.client/.test(fn[0]));
  if (!fn) f.push(`${FILES.engine}: insertPostingLines not found`);
  else if (viaWriter) {
    f.push(...writerGaps(writer));
  } else {
    const body = fn[0];
    const loop = body.indexOf("for (const line of input.lines)");
    const post = body.indexOf("INSERT INTO accounting.journal_entry_postings");
    const link = body.indexOf("INSERT INTO accounting.transaction_source_links");
    if (loop < 0 || post < 0 || link < 0 || !(loop < post && post < link)) {
      f.push(`${FILES.engine}: insertPostingLines must write the transaction_source_links row inside the posting loop, after each posting insert`);
    }
    if (!/input\.client\.query[\s\S]{0,40}INSERT INTO accounting\.transaction_source_links/.test(body)) {
      f.push(`${FILES.engine}: the link must be written on the posting's own client (same transaction)`);
    }
  }
  if ((engine.match(/INSERT INTO accounting\.transaction_source_links/g) ?? []).length + (viaWriter ? 1 : 0) < 2 &&
      !/reversePostedSourceTransaction[\s\S]*insertPostingLineWithSpine\(/.test(engine)) {
    f.push(`${FILES.engine}: the reversal path no longer writes its spine link`);
  }
  // ROUND 393.3: void writes each reversal leg through the writer, its spine row naming the voided entity as 'reversal_of'.
  if (!/insertPostingLineWithSpineIfNew\(client[\s\S]{0,1400}relationship_role: "reversal_of",\s*spine_link: \{ linked_object_type: params\.entityType, linked_object_id: params\.entityId \}/.test(voidSvc)) {
    f.push(`${FILES.voidSvc}: each reversal leg must write its 'reversal_of' link on the same client`);
  }
  return f;
}

export function judge(rows) {
  const f = [];
  let strandedNet = 0;
  for (const r of rows) {
    const t = r.source_type ?? "(none)";
    if (Number(r.unlinked_doc_exists) > 0) {
      f.push(`${r.unlinked_doc_exists} ${t} posting(s) have a live source document and no spine link — a writer skipped writeTransactionSourceLink`);
    }
    const stranded = Number(r.unlinked_doc_gone);
    const ceiling = STRANDED_CEILING[t] ?? 0;
    if (stranded > ceiling) f.push(`${stranded} ${t} posting(s) stranded by a purge (document gone, GL kept) — ceiling ${ceiling}; a purge deleted a document without its entries`);
    strandedNet += Number(r.stranded_net_cents);
  }
  if (strandedNet !== 0) f.push(`stranded postings net to ${strandedNet} cents, not 0 — a purged document left a one-sided balance in the ledger`);
  return f;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const engineNoLink = real.engine.replace(
    /(async function insertPostingLines\([\s\S]*?)INSERT INTO accounting\.transaction_source_links/,
    "$1INSERT INTO accounting.audit_noop"
  );
  const plants = [
    ["poster stops writing the link", { ...real, engine: engineNoLink }],
    ["the engine stops calling the writer", { ...real, engine: real.engine.replace("return insertPostingLinesWithSpine(\n    input.client", "return insertPostingLinesNoSpine(\n    input.client") }],
    ["the writer stops writing the link", { ...real, writer: real.writer.replace(/INSERT INTO accounting\.transaction_source_links/, "INSERT INTO accounting.audit_noop") }],
    ["the writer stops refusing a sourceless line", { ...real, writer: real.writer.replace("if (!line.source_transaction_type || !line.source_transaction_id) {", "if (false) {") }],
    ["void stops naming the voided entity on its spine", { ...real, voidSvc: real.voidSvc.replace('relationship_role: "reversal_of",', 'relationship_role: "source_transaction",') }],
  ];
  for (const [name, s] of plants) {
    if (JSON.stringify(s) === JSON.stringify(real)) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  const ok = [{ source_type: "expense", unlinked_doc_exists: 0, unlinked_doc_gone: 3860, stranded_net_cents: 0 }, { source_type: "invoice", unlinked_doc_exists: 0, unlinked_doc_gone: 48, stranded_net_cents: 0 }];
  if (judge(ok).length) fails.push(`measured state flagged: ${judge(ok).join("; ")}`);
  if (judge([{ source_type: "bill", unlinked_doc_exists: 1, unlinked_doc_gone: 0, stranded_net_cents: 0 }]).length !== 1) fails.push("a live unlinked posting not caught");
  if (judge([{ source_type: "expense", unlinked_doc_exists: 0, unlinked_doc_gone: 3861, stranded_net_cents: 0 }]).length !== 1) fails.push("stranded growth not caught");
  if (judge([{ source_type: "expense", unlinked_doc_exists: 0, unlinked_doc_gone: 10, stranded_net_cents: 500 }]).length !== 1) fails.push("one-sided stranded balance not caught");
  const n = plants.length + 4;
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${n}/${n}`);
  process.exit(0);
}

const codeFails = check(read());
if (codeFails.length) { console.error(`${LABEL}: FAIL\n  ${codeFails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — code arm passed; the live arm needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  // Index-friendly: source_transaction_id is TEXT and the document ids are UUID. Casting both sides to text (the first
  // version) defeated every primary-key index — 251 s for 7,909 postings, long enough to hold a snapshot that stalled
  // another seat's CREATE INDEX CONCURRENTLY in Render pre-deploy (2026-10-03). Convert once (uuid-shaped only, so a
  // non-uuid value can never throw) and LEFT JOIN on the primary keys: 0.27 s, identical counts.
  const rows = (await c.query(`
    WITH u AS (
      SELECT p.source_transaction_type AS source_type, p.amount_cents, p.debit_or_credit,
             CASE WHEN p.source_transaction_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN p.source_transaction_id::uuid END AS sid
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
       WHERE p.operating_company_id = $1::uuid
         AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l.journal_entry_posting_id = p.id)),
    d AS (
      SELECT u.*, CASE u.source_type
                    WHEN 'expense' THEN e.id IS NOT NULL
                    WHEN 'invoice' THEN i.id IS NOT NULL
                    WHEN 'bill'    THEN b.id IS NOT NULL
                    ELSE true END AS doc_exists
        FROM u
        LEFT JOIN accounting.expenses e ON u.source_type = 'expense' AND e.id = u.sid
        LEFT JOIN accounting.invoices i ON u.source_type = 'invoice' AND i.id = u.sid
        LEFT JOIN accounting.bills    b ON u.source_type = 'bill'    AND b.id = u.sid)
    SELECT source_type,
           count(*) FILTER (WHERE doc_exists)     AS unlinked_doc_exists,
           count(*) FILTER (WHERE NOT doc_exists) AS unlinked_doc_gone,
           COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END) FILTER (WHERE NOT doc_exists), 0)::bigint AS stranded_net_cents
      FROM d GROUP BY source_type`, [USMCA])).rows;
  const total = Number((await c.query(
    `SELECT count(*)::int AS n FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted' WHERE p.operating_company_id = $1::uuid`,
    [USMCA]
  )).rows[0].n);
  await c.query("ROLLBACK");
  if (total === 0) { console.error(`${LABEL}: FAIL — 0 posted USMCA postings read; an empty result is an instrument problem, not a pass`); process.exit(1); }
  const bad = judge(rows);
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  const stranded = rows.filter((r) => Number(r.unlinked_doc_gone) > 0).map((r) => `${r.source_type} ${r.unlinked_doc_gone}`).join(", ") || "none";
  console.log(`${LABEL}: PASS — ${total} posted USMCA postings; 0 with a live document and no link; stranded by purge (net 0, shrink-only): ${stranded}`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
