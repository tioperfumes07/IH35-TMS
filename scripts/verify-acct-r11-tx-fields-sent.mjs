#!/usr/bin/env node
/**
 * verify-acct-r11-tx-fields-sent.mjs  (ACCT-R-11 / 0441-mod8-tx-fields-captured-not-sent)
 *
 * Root cause it locks: BankingTransactionsDesignView captured Check no. / Class / Location /
 * Billable / Tags in RowDetailDraft but postTransaction omitted them from categorizeBankTransaction —
 * operator input silently evaporated on Post (draft-only overlay, lost on reload).
 *
 * Asserts (static):
 *   1. End-to-end wiring from verify-bank-tx-capture-fields-persisted (migration + route UPDATE +
 *      postTransaction send + makeDefaultDraft hydrate + Plaid list SELECT).
 *   2. apps/frontend/src/api/banking.ts — PlaidBankTransaction read shape + categorizeBankTransaction
 *      request body type both declare check_number, class_id, location, is_billable, tags.
 *   3. Active categorize submit path (BankingTransactionsDesignView postTransaction) sends all five
 *      fields; is_billable is the raw boolean (never `|| undefined`, which blocks un-checking).
 *
 * Self-test: node scripts/verify-acct-r11-tx-fields-sent.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { evaluate as evaluateEndToEnd } from "./verify-bank-tx-capture-fields-persisted.mjs";

const BANKING_API_REL = "apps/frontend/src/api/banking.ts";
const VIEW_REL = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

const REQUEST_FIELDS = ["check_number", "class_id", "location", "is_billable", "tags"];
const RESPONSE_FIELDS = [
  "check_number",
  "categorization_class_id",
  "categorization_class_name",
  "categorization_location",
  "is_billable",
  "tags",
];

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * @param {{bankingApiSrc: string, viewSrc: string, endToEndInputs: Parameters<typeof evaluateEndToEnd>[0]}} ctx
 * @returns {string[]}
 */
export function evaluateAcctR11({ bankingApiSrc, viewSrc, endToEndInputs }) {
  const failures = [...evaluateEndToEnd(endToEndInputs)];

  const api = stripComments(bankingApiSrc);
  for (const field of REQUEST_FIELDS) {
    if (!new RegExp(`\\b${field}\\?:`).test(api)) {
      failures.push(`${BANKING_API_REL} — categorizeBankTransaction body type must declare optional ${field}`);
    }
  }
  for (const field of RESPONSE_FIELDS) {
    if (!new RegExp(`\\b${field}\\?:`).test(api)) {
      failures.push(`${BANKING_API_REL} — PlaidBankTransaction must declare optional ${field} for read-back/hydrate`);
    }
  }

  const view = stripComments(viewSrc);
  if (!/async function postTransaction\(/.test(view)) {
    failures.push(`${VIEW_REL} — postTransaction must remain the active categorize submit path`);
  }
  const postBlock = view.match(/async function postTransaction[\s\S]*?await categorizeBankTransaction\([\s\S]*?\}\);/);
  if (!postBlock) {
    failures.push(`${VIEW_REL} — postTransaction must call categorizeBankTransaction with a body object`);
  } else {
    const body = postBlock[0];
    for (const [re, msg] of [
      [/check_number:\s*draft\.checkNo/, "postTransaction body must send check_number"],
      [/class_id:\s*draft\.classId/, "postTransaction body must send class_id"],
      [/location:\s*draft\.location/, "postTransaction body must send location"],
      [/is_billable:\s*draft\.billable\b(?!\s*\|\|)/, "postTransaction body must send is_billable as raw boolean"],
      [/tags:\s*draft\.tags/, "postTransaction body must send tags"],
    ]) {
      if (!re.test(body)) failures.push(`${VIEW_REL} — ${msg}`);
    }
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function readRepoOrNull(rel) {
  try {
    return readRepo(rel);
  } catch {
    return null;
  }
}

function endToEndInputs() {
  return {
    migrationSql: readRepoOrNull("db/migrations/202607690000_bank_tx_capture_fields.sql"),
    heldRegistryJson: readRepo("db/migrations/.held-migrations.json"),
    routesSrc: readRepo("apps/backend/src/banking/categorization.routes.ts"),
    listSrc: readRepo("apps/backend/src/integrations/plaid/link.routes.ts"),
    viewSrc: readRepo(VIEW_REL),
  };
}

function runReal() {
  const failures = evaluateAcctR11({
    bankingApiSrc: readRepo(BANKING_API_REL),
    viewSrc: readRepo(VIEW_REL),
    endToEndInputs: endToEndInputs(),
  });
  if (failures.length > 0) {
    console.error("[verify-acct-r11-tx-fields-sent] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    "[verify-acct-r11-tx-fields-sent] OK — ACCT-R-11 capture fields sent on categorize + API types + backend persist + hydrate"
  );
}

function runSelftest() {
  const good = {
    bankingApiSrc: readRepo(BANKING_API_REL),
    viewSrc: readRepo(VIEW_REL),
    endToEndInputs: endToEndInputs(),
  };
  if (good.endToEndInputs.migrationSql == null) {
    console.error("SELFTEST FAIL — held migration missing; cannot selftest against repo state");
    process.exit(1);
  }
  const cases = [
    { name: "healthy: current repo state", mutate: (i) => i, expectPass: true },
    {
      name: "regression: API type drops is_billable",
      mutate: (i) => ({ ...i, bankingApiSrc: i.bankingApiSrc.replace(/is_billable\?:/g, "is_billable_dropped?:") }),
      expectPass: false,
    },
    {
      name: "regression: postTransaction stops sending tags",
      mutate: (i) => ({ ...i, viewSrc: i.viewSrc.replace(/tags:\s*draft\.tags/, "") }),
      expectPass: false,
    },
    {
      name: "regression: is_billable weakened to || undefined",
      mutate: (i) => ({
        ...i,
        viewSrc: i.viewSrc.replace(/is_billable:\s*draft\.billable/, "is_billable: draft.billable || undefined"),
      }),
      expectPass: false,
    },
    {
      name: "regression: backend stops persisting check_number",
      mutate: (i) => ({
        ...i,
        endToEndInputs: {
          ...i.endToEndInputs,
          routesSrc: i.endToEndInputs.routesSrc.replace(
            /check_number\s*=\s*COALESCE\(/,
            "check_number_dropped = COALESCE("
          ),
        },
      }),
      expectPass: false,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = evaluateAcctR11(c.mutate({ ...good }));
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"}`);
      for (const f of failures) console.error(`    · ${f}`);
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("[verify-acct-r11-tx-fields-sent] --selftest OK");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
