#!/usr/bin/env node
import { readFileSync } from "node:fs";

const ENGINE = "apps/backend/src/driver-finance/settlement-engine.ts";
const CLOSE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const source = () => ({ engine: readFileSync(ENGINE, "utf8"), close: readFileSync(CLOSE, "utf8") });

export function failures(src = source()) {
  const out = [];
  if (!/ESCROW_PER_LOAD_CONTRIBUTION_CENTS = 2_500/.test(src.engine)) out.push("per-load escrow is not $25");
  if (!/ON CONFLICT \(source_driver_bill_id, line_type\)[\s\S]{0,100}DO NOTHING/.test(src.engine)) out.push("per-load escrow lacks bill-grain idempotency");
  if (!/line_type = 'escrow_contribution'[\s\S]{0,120}is_active = true/.test(src.engine)) out.push("cap calculation omits active accrued load lines");
  if (!/LIMIT 1\s+FOR UPDATE/.test(src.engine)) out.push("concurrent accruals do not lock the parent settlement");
  if (!/currentBalanceCents: postedBalanceCents \+ alreadyAccruedCents/.test(src.engine)) out.push("cap does not include posted plus accrued balance");
  if (!/settlement\.settlement_model === "load_bookended"[\s\S]{0,100}loadAccruedEscrowContributionCents/.test(src.close)) out.push("load-bookended close still applies a flat contribution");
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = source();
  if (failures(good).length) throw new Error(`baseline rejected: ${failures(good).join(" | ")}`);
  const bad = { ...good, engine: good.engine.replace("ESCROW_PER_LOAD_CONTRIBUTION_CENTS = 2_500", "ESCROW_PER_LOAD_CONTRIBUTION_CENTS = 25_000") };
  if (failures(bad).length === 0) throw new Error("flat-$250 mutation escaped");
}
const found = failures();
if (found.length) { console.error(found.join("\n")); process.exit(1); }
console.log("verify-escrow-accrues-per-load-not-per-settlement: OK");
