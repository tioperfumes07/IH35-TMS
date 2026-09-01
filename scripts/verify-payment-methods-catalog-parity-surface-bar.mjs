#!/usr/bin/env node
/**
 * ACCT-F3530 — Payment Methods Catalog must use ParityTable (Search+Range+gear),
 * not a raw <table> that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/PaymentMethodsCatalogPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "PaymentMethodsCatalogPage: must use ParityTable");
  assert(src.includes('storageKey="payment-methods-catalog"'), "PaymentMethodsCatalogPage: must set storageKey for gear persistence");
  assert(!/<table\b/.test(src), "PaymentMethodsCatalogPage: must not use raw HTML table (missing surface bar)");
  assert(src.includes("+ Create"), "PaymentMethodsCatalogPage: keep + Create");
  assert(src.includes("ReferenceSelect") && src.includes('createKind="account"'), "PaymentMethodsCatalogPage: keep ReferenceSelect createKind=account");
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
  assert(failed, "selftest: expected FAIL on raw <table>");
  console.log("verify-payment-methods-catalog-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-payment-methods-catalog-parity-surface-bar PASS");
}
