#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/driver-finance/settlement-engine.ts";
const gate = "scripts/money-pr-local-gate.mjs";
const source = fs.readFileSync(file, "utf8");
const gateSource = fs.readFileSync(gate, "utf8");

function failures(text, gateText) {
  const out = [];
  if (!text.includes("SET settled_in_settlement_id = $1::uuid")) out.push("settlement materializer does not stamp the bill link");
  if (!text.includes("settled_in_settlement_id IS NULL OR settled_in_settlement_id = $1::uuid")) out.push("writer can repoint a bill from another settlement");
  if (!text.includes("driver_bill_settlement_link_conflict")) out.push("link conflict does not fail loud");
  if (!text.includes("AND voided_at IS NULL\n        AND status <> 'void'\n        AND (settled_in_settlement_id")) out.push("void driver bill can be linked");
  if (!gateText.includes("verify-driver-bill-linked-at-settlement-time.mjs")) out.push("guard is not wired into money gate");
  return out;
}

if (process.argv.includes("--selftest")) {
  const plants = [
    source.replace("SET settled_in_settlement_id = $1::uuid", "SET updated_at = now()"),
    source.replace("settled_in_settlement_id IS NULL OR settled_in_settlement_id = $1::uuid", "TRUE"),
    source.replace("driver_bill_settlement_link_conflict", "planted_silent_conflict"),
    source.replace("AND voided_at IS NULL\n        AND status <> 'void'\n        AND (settled_in_settlement_id", "AND voided_at IS NULL\n        AND TRUE\n        AND (settled_in_settlement_id"),
  ];
  const caught = plants.filter((p) => failures(p, gateSource).length > 0).length;
  if (caught !== plants.length) {
    console.error(`verify-driver-bill-linked-at-settlement-time --selftest FAIL ${caught}/${plants.length}`);
    process.exit(1);
  }
  console.log(`verify-driver-bill-linked-at-settlement-time --selftest PASS ${caught}/${plants.length}`);
  process.exit(0);
}

const found = failures(source, gateSource);
if (found.length) {
  console.error(`verify-driver-bill-linked-at-settlement-time FAIL\n- ${found.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-driver-bill-linked-at-settlement-time PASS — eligible bills are linked during settlement-line materialization and conflicts fail loud");
