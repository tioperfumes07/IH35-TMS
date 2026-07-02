#!/usr/bin/env node
// verify-required-document-types-entity-scope.mjs — DOC-REQ-1 (decision #6) regression guard.
//
// compliance.required_document_types is a per-entity catalog of required documents (FMCSA/IRS defaults +
// per-carrier config). It MUST stay entity-scoped and void-not-delete:
//   • composite UNIQUE (operating_company_id, entity_kind, code) — never a bare global unique on code,
//   • FORCED RLS + entity-scoped select/write policies filtering operating_company_id,
//   • GRANT to ih35_app WITHOUT DELETE (void via is_active),
//   • the regulatory-default seed present + idempotent (ON CONFLICT DO NOTHING).
//
// Static (no DB). No-op until the DOC-REQ-1 migration is present (so it doesn't fail pre-DOC-REQ-1 main).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "db/migrations");
const blob = fs
  .readdirSync(MIG)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(path.join(MIG, f), "utf8"))
  .join("\n");

const TABLE = "compliance.required_document_types";
const present = new RegExp(`CREATE TABLE IF NOT EXISTS ${TABLE.replace(".", "\\.")}`, "i").test(blob);

if (!present) {
  console.log("[required-document-types-entity-scope] SKIP — DOC-REQ-1 migration not present yet.");
  process.exit(0);
}

const errs = [];
const t = TABLE.replace(".", "\\.");

if (!/UNIQUE\s*\(\s*operating_company_id,\s*entity_kind,\s*code\s*\)/i.test(blob))
  errs.push("missing composite UNIQUE (operating_company_id, entity_kind, code)");
if (!new RegExp(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`, "i").test(blob))
  errs.push("required_document_types is not FORCE ROW LEVEL SECURITY");
if (!new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`, "i").test(blob))
  errs.push("required_document_types RLS not enabled");
if (!/POLICY[^\n]*required_document_types_entity_select[\s\S]{0,220}operating_company_id/i.test(blob))
  errs.push("missing entity-scoped SELECT policy filtering operating_company_id");
if (!/POLICY[^\n]*required_document_types_entity_write[\s\S]{0,320}operating_company_id/i.test(blob))
  errs.push("missing entity-scoped write policy filtering operating_company_id");
if (!/entity_kind\s+text\s+NOT NULL\s+CHECK\s*\(\s*entity_kind\s+IN\s*\(\s*'driver','unit','customer','vendor'\s*\)/i.test(blob))
  errs.push("entity_kind CHECK must pin ('driver','unit','customer','vendor')");
// GRANT to ih35_app must not include DELETE (void-not-delete). Match only the real GRANT statement
// (uppercase privilege list, case-sensitive) so a comment word like "GRANTs (no DELETE …)" can't match.
const grantMatch = blob.match(new RegExp(`GRANT\\s+[A-Z, ]+ON ${t} TO ih35_app`));
if (!grantMatch) errs.push("missing GRANT ... ON required_document_types TO ih35_app");
else if (/DELETE/.test(grantMatch[0])) errs.push("GRANT must NOT include DELETE (void-not-delete via is_active)");
if (!/ON CONFLICT\s*\(\s*operating_company_id,\s*entity_kind,\s*code\s*\)\s*DO NOTHING/i.test(blob))
  errs.push("seed must be idempotent (ON CONFLICT (operating_company_id, entity_kind, code) DO NOTHING)");
if (!/'cdl'|'med_cert'|'form_2290'/i.test(blob))
  errs.push("regulatory-default seed rows (cdl / med_cert / form_2290 …) missing");

if (errs.length) {
  console.error("verify:required-document-types-entity-scope — FAILED");
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("[required-document-types-entity-scope] OK — per-entity catalog (composite unique + FORCED RLS + no-DELETE grant + idempotent regulatory seed).");
