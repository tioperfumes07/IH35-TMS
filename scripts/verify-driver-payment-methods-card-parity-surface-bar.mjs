#!/usr/bin/env node
/**
 * DRV-F3562 — DriverPaymentMethodsCard must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/driver-profile/DriverPaymentMethodsCard.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "DriverPaymentMethodsCard: must use ParityTable");
  assert(src.includes('storageKey="driver-payment-methods-card"'), "DriverPaymentMethodsCard: must set storageKey");
  assert(src.includes('tableTestId="driver-payment-methods-card-table"'), "DriverPaymentMethodsCard: must set tableTestId");
  assert(!/<table\b/.test(src), "DriverPaymentMethodsCard: must not use raw HTML table");
  assert(src.includes("driverPaymentMethodsApi"), "DriverPaymentMethodsCard: keep payment-methods API");
  assert(src.includes("+ Create method"), "DriverPaymentMethodsCard: keep + Create method");
  assert(src.includes("voidMutation"), "DriverPaymentMethodsCard: keep void/remove action");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function DriverPaymentMethodsCard() {",
    '  return <table className="w-full" data-testid="driver-payment-methods-card-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-driver-payment-methods-card-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-driver-payment-methods-card-parity-surface-bar PASS");
}
