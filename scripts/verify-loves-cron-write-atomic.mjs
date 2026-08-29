#!/usr/bin/env node
import { readFileSync } from "node:fs";

const path = "apps/backend/src/sync/loves-card-import.ts";
const source = readFileSync(path, "utf8");

function verify(src = source) {
  const failures = [];
  const start = src.indexOf("export async function importLovesRowsForCompany");
  const end = src.indexOf("export async function runLovesCardImportTick", start);
  const writer = start >= 0 && end > start ? src.slice(start, end) : "";
  if (/\.catch\(/.test(writer)) failures.push("cron writer must not disguise database failures as skipped rows");
  if (/UPDATE fuel\.loves_prices_daily[\s\S]*INSERT INTO fuel\.loves_prices_daily/.test(writer)) failures.push("cron writer must not use a racy update-then-insert sequence");
  if (!/ON CONFLICT \(operating_company_id, effective_date, station_name, station_address\)[\s\S]*DO UPDATE SET/.test(writer)) failures.push("cron writer must atomically upsert on the canonical unique key");
  if (!/RETURNING \(xmax = 0\) AS inserted/.test(writer)) failures.push("cron upsert must return inserted/update classification evidence");
  if (!/if \(!persisted\) throw new Error\("loves_card_price_upsert_failed"\)/.test(writer)) failures.push("cron upsert must fail closed without persistence evidence");
  if (!/if \(persisted\.inserted\) counts\.rows_added \+= 1;[\s\S]*else counts\.rows_updated \+= 1;/.test(writer)) failures.push("cron counts must reflect atomic insert versus update truth");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("ON CONFLICT (operating_company_id, effective_date, station_name, station_address)", "ON CONFLICT DO NOTHING"),
    source.replace("DO UPDATE SET", "DO NOTHING"),
    source.replace("RETURNING (xmax = 0) AS inserted", "RETURNING true AS inserted"),
    source.replace('if (!persisted) throw new Error("loves_card_price_upsert_failed");', "// planted missing result check"),
    source.replace("else counts.rows_updated += 1;", "else counts.rows_skipped += 1;"),
    source.replace("const upsertRes = await client.query", "const upsertRes = await client.query").replace(");\n    const persisted = upsertRes.rows[0];", ").catch(() => ({ rows: [], rowCount: 0 }));\n    const persisted = upsertRes.rows[0];"),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === source || verify(mutation).length === 0) throw new Error(`selftest mutation escaped: ${index + 1}`);
  });
  console.log("verify-loves-cron-write-atomic SELFTEST PASS (6/6)");
}

const failures = verify();
if (failures.length) {
  console.error("verify-loves-cron-write-atomic FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("verify-loves-cron-write-atomic PASS");
