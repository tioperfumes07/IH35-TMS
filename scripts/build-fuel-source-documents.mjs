// Builds data/settlement-creator/fuel-source-documents.json — the expected fuel set for
// verify-fuel-transactions-per-load — from the Settlement Creator's documents (one JSON per signed
// settlement, the same drafts the Creator posted). Lead 443.69 item 2: the expected set is DERIVED from the
// source documents, never a frozen count. Re-run when a new settlement document is added; nothing is
// hand-typed. Lines with receipt_cents = 0 are not purchases (5803 carries "62.410", a gallons value in the
// invoice column, at $0) and are kept under excluded_lines with the reason, not silently dropped.
// Run: node scripts/build-fuel-source-documents.mjs <dir-of-settlement-jsons>
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "data/settlement-creator/fuel-source-documents.json");
const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("usage: node scripts/build-fuel-source-documents.mjs <dir-of-settlement-jsons>");
  process.exit(2);
}
const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const documents = [];
const excluded = [];
for (const f of fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const lines = [];
  for (const p of d.fuel_purchases || []) {
    const line = {
      load_number: String(p.load_number), invoice: String(p.invoice), date: p.date, receipt_cents: p.receipt_cents,
      gallons: p.gallons, card: p.card, fuel_type: p.fuel_type, vendor_name: p.vendor_name, location: p.location,
    };
    if (!(Number(p.receipt_cents) > 0)) excluded.push({ settlement_no: String(d.settlement_no), ...line, reason: "receipt_cents is 0 — not a purchase" });
    else lines.push(line);
  }
  documents.push({ settlement_no: String(d.settlement_no), period_start: d.period_start, period_end: d.period_end, fuel_purchases: lines });
}
const out = {
  _comment: "Expected fuel set for verify-fuel-transactions-per-load, extracted by scripts/build-fuel-source-documents.mjs from the Settlement Creator documents. Do not hand-edit fuel_purchases; date_corrections is the only hand-maintained section and every entry quotes its document.",
  source: "Settlement Creator documents 443-11 (one JSON per settlement), printed settlements in TMS-Company and Driver-Settlements",
  documents,
  excluded_lines: excluded,
  date_corrections: prior.date_corrections || [],
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${documents.length} documents, ${documents.reduce((s, d) => s + d.fuel_purchases.length, 0)} fuel lines, ${excluded.length} excluded → ${path.relative(process.cwd(), OUT)}`);
