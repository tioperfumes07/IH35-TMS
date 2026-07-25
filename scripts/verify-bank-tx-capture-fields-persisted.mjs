#!/usr/bin/env node
/**
 * verify-bank-tx-capture-fields-persisted.mjs  (0441-mod8-tx-fields-captured-not-sent guard)
 *
 * Root cause it locks: the Banking categorize panel captured Check no. / Class / Location / Billable /
 * Tags in its RowDetailDraft but postTransaction never sent them, the backend categorize route never
 * accepted them, and banking.bank_transactions had no columns to hold them — operator input silently
 * evaporated on Post (draft-only overlay, lost on reload).
 *
 * Asserts (static, comment-stripped where noted):
 *   1. Held migration 202607690000_bank_tx_capture_fields.sql exists, adds all 5 columns, carries the
 *      DO-NOT-RUN-ON-PROD marker, and is registered in db/migrations/.held-migrations.json.
 *   2. categorization.routes.ts: categorizeBodySchema accepts check_number/class_id/location/
 *      is_billable/tags AND the categorize UPDATE writes all 5 persisted columns.
 *   3. BankingTransactionsDesignView.tsx: postTransaction SENDS all 5 fields, and makeDefaultDraft
 *      HYDRATES checkNo/classId/location/billable/tags from the transaction row (not hardcoded blanks).
 *   4. link.routes.ts (Plaid txn list): the SELECT returns the persisted fields + the JOIN-derived
 *      catalogs.classes label, so the register can hydrate.
 *
 * Self-test: node scripts/verify-bank-tx-capture-fields-persisted.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MIGRATION_REL = "db/migrations/202607690000_bank_tx_capture_fields.sql";
const HELD_REGISTRY_REL = "db/migrations/.held-migrations.json";
const ROUTES_REL = "apps/backend/src/banking/categorization.routes.ts";
const LIST_REL = "apps/backend/src/integrations/plaid/link.routes.ts";
const VIEW_REL = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

const COLUMNS = ["check_number", "categorization_class_id", "categorization_location", "is_billable", "tags"];
const BODY_FIELDS = ["check_number", "class_id", "location", "is_billable", "tags"];

/** Strip block/line comments so explanatory prose can't satisfy a check. */
function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * @param {{migrationSql: string|null, heldRegistryJson: string, routesSrc: string, listSrc: string, viewSrc: string}} inputs
 * @returns {string[]} failures
 */
export function evaluate({ migrationSql, heldRegistryJson, routesSrc, listSrc, viewSrc }) {
  const failures = [];

  // 1. Held migration
  if (migrationSql == null) {
    failures.push(`${MIGRATION_REL} — held migration missing`);
  } else {
    for (const col of COLUMNS) {
      if (!new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`).test(migrationSql)) {
        failures.push(`${MIGRATION_REL} — missing ADD COLUMN IF NOT EXISTS ${col}`);
      }
    }
    if (!/DO NOT RUN ON PROD/.test(migrationSql.slice(0, 1200))) {
      failures.push(`${MIGRATION_REL} — header must carry the 'DO NOT RUN ON PROD' marker (held migration)`);
    }
  }
  let held;
  try {
    held = JSON.parse(heldRegistryJson);
  } catch {
    failures.push(`${HELD_REGISTRY_REL} — invalid JSON`);
  }
  if (held && !(held.held ?? []).some((h) => h.file === "202607690000_bank_tx_capture_fields.sql")) {
    failures.push(`${HELD_REGISTRY_REL} — 202607690000_bank_tx_capture_fields.sql not registered as held`);
  }

  // 2. Backend categorize route: schema + UPDATE
  const routes = stripComments(routesSrc);
  for (const field of BODY_FIELDS) {
    if (!new RegExp(`\\b${field}:\\s*z\\.`).test(routes)) {
      failures.push(`${ROUTES_REL} — categorizeBodySchema must accept ${field}`);
    }
  }
  for (const col of COLUMNS) {
    if (!new RegExp(`${col}\\s*=\\s*COALESCE\\(`).test(routes)) {
      failures.push(`${ROUTES_REL} — categorize UPDATE must persist ${col} (COALESCE pattern)`);
    }
  }

  // 3. Frontend: postTransaction sends + makeDefaultDraft hydrates
  const view = stripComments(viewSrc);
  const sendChecks = [
    [/check_number:\s*draft\.checkNo/, "postTransaction must send check_number from draft.checkNo"],
    [/class_id:\s*draft\.classId/, "postTransaction must send class_id from draft.classId"],
    [/location:\s*draft\.location/, "postTransaction must send location from draft.location"],
    [/is_billable:\s*draft\.billable\b(?!\s*\|\|)/, "postTransaction must send is_billable as the raw boolean (|| undefined would make un-checking unpersistable)"],
    [/tags:\s*draft\.tags/, "postTransaction must send tags from draft.tags"],
  ];
  for (const [re, msg] of sendChecks) {
    if (!re.test(view)) failures.push(`${VIEW_REL} — ${msg}`);
  }
  const hydrateChecks = [
    [/checkNo:\s*tx\.check_number/, "makeDefaultDraft must hydrate checkNo from tx.check_number"],
    [/classId:\s*tx\.categorization_class_id/, "makeDefaultDraft must hydrate classId from tx.categorization_class_id"],
    [/location:\s*tx\.categorization_location/, "makeDefaultDraft must hydrate location from tx.categorization_location"],
    [/billable:\s*Boolean\(tx\.is_billable\)/, "makeDefaultDraft must hydrate billable from tx.is_billable"],
    [/tags:\s*tx\.tags/, "makeDefaultDraft must hydrate tags from tx.tags"],
  ];
  for (const [re, msg] of hydrateChecks) {
    if (!re.test(view)) failures.push(`${VIEW_REL} — ${msg}`);
  }

  // 4. List SELECT serves the persisted fields (+ class label via catalogs.classes JOIN)
  const list = stripComments(listSrc);
  const listChecks = [
    [/bt\.check_number\b/, "list SELECT must return bt.check_number"],
    [/bt\.categorization_class_id\b/, "list SELECT must return bt.categorization_class_id"],
    [/class_name\s+AS\s+categorization_class_name\b/i, "list SELECT must derive categorization_class_name from catalogs.classes"],
    [/JOIN catalogs\.classes\b/, "list SELECT must LEFT JOIN catalogs.classes for the label"],
    [/bt\.categorization_location\b/, "list SELECT must return bt.categorization_location"],
    [/bt\.is_billable\b/, "list SELECT must return bt.is_billable"],
    [/bt\.tags\b/, "list SELECT must return bt.tags"],
  ];
  for (const [re, msg] of listChecks) {
    if (!re.test(list)) failures.push(`${LIST_REL} — ${msg}`);
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

function realInputs() {
  return {
    migrationSql: readRepoOrNull(MIGRATION_REL),
    heldRegistryJson: readRepo(HELD_REGISTRY_REL),
    routesSrc: readRepo(ROUTES_REL),
    listSrc: readRepo(LIST_REL),
    viewSrc: readRepo(VIEW_REL),
  };
}

function runReal() {
  const failures = evaluate(realInputs());
  if (failures.length > 0) {
    console.error("[verify-bank-tx-capture-fields-persisted] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    "[verify-bank-tx-capture-fields-persisted] OK — check_number/class/location/is_billable/tags persist end-to-end (migration + route + send + hydrate + list)"
  );
}

function runSelftest() {
  const good = realInputs();
  if (good.migrationSql == null) {
    console.error("SELFTEST FAIL — real held migration missing; cannot selftest against repo state");
    process.exit(1);
  }
  const cases = [
    { name: "healthy: current repo state", mutate: (i) => i, expectPass: true },
    {
      name: "regression: migration deleted",
      mutate: (i) => ({ ...i, migrationSql: null }),
      expectPass: false,
    },
    {
      name: "regression: DO-NOT-RUN marker stripped",
      mutate: (i) => ({ ...i, migrationSql: i.migrationSql.replace(/DO NOT RUN ON PROD/g, "runs everywhere") }),
      expectPass: false,
    },
    {
      name: "regression: held registration removed",
      mutate: (i) => ({
        ...i,
        heldRegistryJson: i.heldRegistryJson.replace("202607690000_bank_tx_capture_fields.sql", "0000_gone.sql"),
      }),
      expectPass: false,
    },
    {
      name: "regression: route stops persisting check_number",
      mutate: (i) => ({ ...i, routesSrc: i.routesSrc.replace(/check_number\s*=\s*COALESCE\(/, "check_number_dropped = COALESCE(") }),
      expectPass: false,
    },
    {
      name: "regression: frontend stops sending class_id",
      mutate: (i) => ({ ...i, viewSrc: i.viewSrc.replace(/class_id:\s*draft\.classId/, "") }),
      expectPass: false,
    },
    {
      name: "regression: is_billable weakened to || undefined",
      mutate: (i) => ({ ...i, viewSrc: i.viewSrc.replace(/is_billable:\s*draft\.billable/, "is_billable: draft.billable || undefined") }),
      expectPass: false,
    },
    {
      name: "regression: list SELECT drops tags",
      mutate: (i) => ({ ...i, listSrc: i.listSrc.replace(/bt\.tags/g, "bt.tags_dropped") }),
      expectPass: false,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = evaluate(c.mutate({ ...good }));
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
  console.log("[verify-bank-tx-capture-fields-persisted] --selftest OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    runSelftest();
  } else {
    runReal();
  }
}
