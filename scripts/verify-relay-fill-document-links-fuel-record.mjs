#!/usr/bin/env node
/**
 * ENG-65 (LEAD 11-03) — a Relay fill expense document must point at its fuel record once one exists.
 * Root cause measured 11-03: 90 live documents ($38,717.03) adopted ON RECEIPT before the fill's fuel records existed;
 * adoptRelayFillExpenseDocument's "already exists" branch (the Settlement Creator's later adopt) never linked them.
 * Static: that branch calls linkRelayFillExpenseToFuelRow; the link is fill-once (… source_fuel_transaction_id IS NULL)
 * and never takes a record another live document holds. --selftest plants each defect in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-fill-document-links-fuel-record";
const FILE = "apps/backend/src/fuel/fuel-expense-document.service.ts";

export function findDefects(src) {
  const out = [];
  const adopt = src.slice(src.indexOf("export async function adoptRelayFillExpenseDocument("));
  const existingBranch = adopt.slice(0, adopt.indexOf("// The entry must be this fill's live posting."));
  if (!/linkRelayFillExpenseToFuelRow\(/.test(existingBranch)) out.push("adopt's already-exists branch does not link the document to its fuel record");
  const linkStart = src.indexOf("export async function linkRelayFillExpenseToFuelRow(");
  if (linkStart < 0) { out.push("linkRelayFillExpenseToFuelRow not exported"); return out; }
  const link = src.slice(linkStart, src.indexOf("\nexport ", linkStart + 10));
  if (!/source_fuel_transaction_id IS NULL/.test(link)) out.push("link is not fill-once (would re-point a set link)");
  if (!/NOT EXISTS \(SELECT 1 FROM accounting\.expenses e WHERE e\.source_fuel_transaction_id = ft\.id AND e\.voided_at IS NULL\)/.test(link)) out.push("link may take a record another live document holds");
  if (!/ft\.voided_at IS NULL/.test(link)) out.push("link may point at a voided fuel record");
  if (!/appendCrudAudit\(/.test(link)) out.push("link is not audited");
  return out;
}

const src = readFileSync(path.join(ROOT, FILE), "utf8");
if (process.argv.includes("--selftest")) {
  const plants = [
    ["adopt no longer links", src.replace(/await linkRelayFillExpenseToFuelRow\(client, \{\n      operating_company_id: company,/, "await Promise.resolve({\n      operating_company_id: company,")],
    ["link re-points set links", src.replace("AND voided_at IS NULL AND source_fuel_transaction_id IS NULL", "AND voided_at IS NULL")],
    ["link takes a held record", src.replace("AND NOT EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL)\n      ORDER BY", "\n      ORDER BY")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const hit = planted !== src && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(src);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — every adopt links a Relay fill document to its primary free fuel record (fill-once, audited)`);
