#!/usr/bin/env node
// verify-audit-chain-verify.mjs — B19-V2 guard. The audit tamper-verifier must (a) record to an append-only,
// FORCED-RLS ops.audit_chain_verifications table, and (b) recompute hashes IN SQL via
// events.calculate_event_hash — NEVER a JS sha256 of event fields (Postgres timestamptz/jsonb text
// formatting can't be reproduced byte-for-byte in JS; a JS recompute would false-flag every row).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };

const migBlob = fs
  .readdirSync(path.join(ROOT, "db/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(`db/migrations/${f}`))
  .join("\n");

const svc = read("apps/backend/src/audit/audit-chain-verify.service.ts");
const errs = [];

if (!/CREATE TABLE IF NOT EXISTS ops\.audit_chain_verifications/i.test(migBlob))
  errs.push("migration must CREATE ops.audit_chain_verifications");
if (!/ALTER TABLE ops\.audit_chain_verifications FORCE ROW LEVEL SECURITY/i.test(migBlob))
  errs.push("ops.audit_chain_verifications must be FORCE ROW LEVEL SECURITY");
const grant = migBlob.match(/GRANT\s+[A-Z, ]+ON ops\.audit_chain_verifications TO ih35_app/);
if (!grant) errs.push("missing GRANT ... ON ops.audit_chain_verifications TO ih35_app");
else if (/DELETE|UPDATE/.test(grant[0])) errs.push("ops.audit_chain_verifications grant must be SELECT+INSERT only (append-only evidence)");

if (!svc) errs.push("missing audit-chain-verify.service.ts");
else {
  if (!/events\.calculate_event_hash/.test(svc))
    errs.push("verifier must recompute via events.calculate_event_hash (SQL)");
  if (/createHash\(|crypto\.|sha256/i.test(svc))
    errs.push("verifier must NOT JS-hash event fields (createHash/sha256) — recompute in SQL only");
  if (!/INSERT INTO\s+ops\.audit_chain_verifications/.test(svc))
    errs.push("verifier must record the run into ops.audit_chain_verifications");
}

if (errs.length) {
  console.error("verify:audit-chain-verify — FAILED");
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("[audit-chain-verify] OK — append-only FORCED-RLS record table + SQL-recompute verifier (no JS hashing).");
