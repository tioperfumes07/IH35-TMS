#!/usr/bin/env node
/**
 * ACCT-F3530 — Payment Methods Catalog must use ParityTable (Search+Range+gear),
 * not a raw <table> that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/PaymentMethodsCatalogPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "PaymentMethodsCatalogPage: must use ParityTable");
  assert(src.includes('storageKey="payment-methods-catalog"'), "PaymentMethodsCatalogPage: must set storageKey for gear persistence");
  assert(!/<table\b/.test(src), "PaymentMethodsCatalogPage: must not use raw HTML table (missing surface bar)");
  assert(src.includes("+ Create"), "PaymentMethodsCatalogPage: keep + Create");
  assert(src.includes("ReferenceSelect") && src.includes('createKind="account"'), "PaymentMethodsCatalogPage: keep ReferenceSelect createKind=account");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good
    .replace(/ParityTable/g, "LegacyTable")
    .replace('storageKey="payment-methods-catalog"', "")
    .replace(
      /\{?\/\* ACCT-F3530:[\s\S]*?<ParityTable[\s\S]*?\/>/,
      `<div><table className="min-w-full"><tbody /></table></div>`,
    );
  // Simpler plant: inject raw table and strip ParityTable token
  const planted = good
    .replace(/import \{ ParityTable[\s\S]*?\} from "[^"]+";\n/, "")
    .replace(/const columns = useMemo[\s\S]*?\],\s*\[accountNameById\],\s*\);\n\n/, "")
    .replace(/\{\/\* ACCT-F3530:[\s\S]*?\/>\n/, `<div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><tbody /></table></div>\n`);
  assert(planted.includes("<table"), "selftest plant must include raw table");
  assert(!planted.includes("ParityTable"), "selftest plant must remove ParityTable");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw <table>");
  console.log("verify-payment-methods-catalog-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-payment-methods-catalog-parity-surface-bar PASS");
}
