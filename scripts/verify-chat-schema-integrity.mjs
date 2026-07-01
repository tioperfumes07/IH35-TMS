#!/usr/bin/env node
// CHAT-1 (DISPATCH-CHAT-01) — encodes the 4 evidence-grade corrections as CI law so they can't
// regress. Statically parses the chat-dispatch migration and asserts, for every chat.* table:
//   1. RLS is ENABLE + FORCE, and every FOR SELECT policy on a chat table is PARTICIPANT-scoped
//      (its USING clause references chat.participants) — FAILS on any entity-only chat SELECT policy.
//   2. NO prev_hash / hash column exists on any chat.* table (forces events.event_log reuse).
//   3. cash_advance_request_id REFERENCES driver_finance.cash_advance_requests AND the attachment
//      doc column REFERENCES docs.files (real FKs, not bare uuids).
//   4. every chat.* FK is ON DELETE RESTRICT (no CASCADE / SET NULL).
//   5. no GRANT ... DELETE ... on any chat.* table to ih35_app.
// Self-test: --self-test injects an entity-only policy, a prev_hash column, and a cascade FK and
// asserts each is caught.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-chat-schema-integrity";
const TABLES = ["threads", "participants", "messages", "attachments", "message_receipts"];

function findMigration() {
  const dir = path.join(ROOT, "db/migrations");
  const hit = fs.readdirSync(dir).filter((f) => /chat_dispatch_schema\.sql$/.test(f)).sort();
  if (!hit.length) return null;
  return path.join(dir, hit[hit.length - 1]);
}

// strip SQL line comments so "hash" in a comment can't false-trip structural checks
const stripComments = (s) => s.replace(/--[^\n]*/g, "");

function check(sqlRaw) {
  const failures = [];
  const sql = stripComments(sqlRaw);

  // 1. RLS ENABLE + FORCE on every table + participant-scoped SELECT policies.
  for (const t of TABLES) {
    const re = new RegExp(`chat\\.${t}\\b`);
    if (!re.test(sql)) { failures.push(`table chat.${t} not found`); continue; }
    if (!new RegExp(`ALTER TABLE chat\\.${t}\\s+ENABLE ROW LEVEL SECURITY`, "i").test(sql))
      failures.push(`chat.${t}: missing ENABLE ROW LEVEL SECURITY`);
    if (!new RegExp(`ALTER TABLE chat\\.${t}\\s+FORCE\\s+ROW LEVEL SECURITY`, "i").test(sql))
      failures.push(`chat.${t}: missing FORCE ROW LEVEL SECURITY`);
  }
  // every FOR SELECT policy on a chat table must be participant-scoped (reference chat.participants).
  const selPolicy = /CREATE POLICY\s+[\w".]+\s+ON\s+chat\.(\w+)\s+FOR SELECT\s+USING\s*\(([\s\S]*?)\);/gi;
  let m, sawSelect = 0;
  while ((m = selPolicy.exec(sql)) !== null) {
    sawSelect++;
    const [, tbl, body] = m;
    if (!/chat\.participants/i.test(body))
      failures.push(`chat.${tbl}: SELECT policy is entity-only (must reference chat.participants — participant-scoped)`);
  }
  if (sawSelect < TABLES.length)
    failures.push(`expected a participant-scoped SELECT policy per table (found ${sawSelect}/${TABLES.length})`);

  // 2. no prev_hash / hash column on chat.* tables.
  if (/\bprev_hash\b/i.test(sql)) failures.push("prev_hash column present — chain must live in events.event_log, not chat.*");
  if (/^\s*hash\s+(text|uuid|bytea)\b/im.test(sql)) failures.push("a 'hash' column is defined on chat.* — reuse events.event_log instead");

  // 3. real FKs for cash advance + attachment doc.
  if (!/cash_advance_request_id\s+uuid\s+REFERENCES\s+driver_finance\.cash_advance_requests\s*\(id\)/i.test(sql))
    failures.push("cash_advance_request_id must be a REAL FK -> driver_finance.cash_advance_requests(id)");
  if (!/document_id\s+uuid\s+REFERENCES\s+docs\.files\s*\(id\)/i.test(sql))
    failures.push("attachment document_id must be a REAL FK -> docs.files(id)");

  // 4. every FK ON DELETE RESTRICT; no CASCADE / SET NULL in the chat migration.
  if (/ON DELETE CASCADE/i.test(sql)) failures.push("ON DELETE CASCADE present — chat.* FKs must be ON DELETE RESTRICT");
  if (/ON DELETE SET NULL/i.test(sql)) failures.push("ON DELETE SET NULL present — chat.* FKs must be ON DELETE RESTRICT");
  const refs = (sql.match(/\bREFERENCES\s+[\w.]+\s*\([\w]+\)/gi) || []).length;
  const restricts = (sql.match(/ON DELETE RESTRICT/gi) || []).length;
  if (refs !== restricts)
    failures.push(`every FK must be ON DELETE RESTRICT (found ${refs} REFERENCES but ${restricts} ON DELETE RESTRICT)`);

  // 5. no GRANT DELETE on chat.* to ih35_app.
  const grants = sql.match(/GRANT[^;]*ON\s+chat\.[^;]*;/gi) || [];
  const defPriv = sql.match(/ALTER DEFAULT PRIVILEGES IN SCHEMA chat[^;]*;/gi) || [];
  for (const g of [...grants, ...defPriv]) if (/\bDELETE\b/i.test(g)) failures.push(`GRANT includes DELETE on chat.* (append-only — no DELETE): ${g.slice(0, 60)}...`);

  return failures;
}

function selfTest(sql) {
  const problems = [];
  // inject an entity-only SELECT policy
  const entityOnly = sql.replace(
    /CREATE POLICY\s+chat_messages_select[\s\S]*?\);/i,
    "CREATE POLICY chat_messages_select ON chat.messages FOR SELECT USING ( operating_company_id IN (SELECT org.user_accessible_company_ids()) );",
  );
  if (check(entityOnly).every((f) => !/entity-only/.test(f))) problems.push("self-test: did NOT catch entity-only SELECT policy");
  // inject a prev_hash column
  if (check(sql.replace("last_seq", "prev_hash text,\n  last_seq")).every((f) => !/prev_hash/.test(f)))
    problems.push("self-test: did NOT catch prev_hash column");
  // inject a cascade FK
  if (check(sql.replace("ON DELETE RESTRICT", "ON DELETE CASCADE")).every((f) => !/CASCADE/.test(f)))
    problems.push("self-test: did NOT catch ON DELETE CASCADE");
  return problems;
}

const file = findMigration();
if (!file) {
  console.error(`${LABEL} — FAILED: no *_chat_dispatch_schema.sql migration found`);
  process.exit(1);
}
const sql = fs.readFileSync(file, "utf8");
const failures = check(sql);
const selfFails = process.argv.includes("--self-test") ? selfTest(sql) : [];

if (failures.length || selfFails.length) {
  console.error(`${LABEL} — FAILED (${path.basename(file)})`);
  for (const f of failures) console.error(`- ${f}`);
  for (const f of selfFails) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (${path.basename(file)}: RLS enable+force, participant-scoped SELECT, no prev_hash/hash col, real advance+doc FKs, all FK ON DELETE RESTRICT, no GRANT DELETE)`);
