#!/usr/bin/env node
/**
 * DRV-F3562 — DriverPaymentMethodsCard must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/driver-profile/DriverPaymentMethodsCard.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "DriverPaymentMethodsCard: must use ParityTable");
  assert(src.includes('storageKey="driver-payment-methods-card"'), "DriverPaymentMethodsCard: must set storageKey");
  assert(src.includes('tableTestId="driver-payment-methods-card-table"'), "DriverPaymentMethodsCard: must set tableTestId");
  assert(!/<table\b/.test(src), "DriverPaymentMethodsCard: must not use raw HTML table");
  assert(src.includes("driverPaymentMethodsApi"), "DriverPaymentMethodsCard: keep payment-methods API");
  assert(src.includes("+ Create method"), "DriverPaymentMethodsCard: keep + Create method");
  assert(src.includes("voidMutation"), "DriverPaymentMethodsCard: keep void/remove action");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  const planted = [
    "export function DriverPaymentMethodsCard() {",
    '  return <table className="w-full" data-testid="driver-payment-methods-card-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
      return planted;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-driver-payment-methods-card-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-driver-payment-methods-card-parity-surface-bar PASS");
}
