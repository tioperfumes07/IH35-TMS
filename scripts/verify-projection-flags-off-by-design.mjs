#!/usr/bin/env node
// verify-projection-flags-off-by-design — ACCT-F01/F06 RECORD guard (Rule 16/17).
//
// This is NOT a "make the flags work" guard — it is a permanent tripwire that the OWNER-DESIGN state
// (QBO_EXPENSES_PROJECTION_ENABLED / QBO_AR_PAYMENTS_PROJECTION_ENABLED default OFF, subledgers honestly
// 0) never gets mistaken for, or silently converted into, a bug fix. It asserts FOUR things every CI run:
//
//   1) Both projection flags are registered DEFAULT OFF (default_enabled=false) in a migration, and NO
//      migration seeds a per-entity feature_flag_overrides ON row for either flag (build-and-HOLD — only
//      the OWNER flips them ON, out-of-band, per operating_company_id).
//   2) isEnabled() (apps/backend/src/lib/feature-flags/service.ts) resolves an ABSENT flag/override to
//      `false` (SAFE-OFF) — the single source of truth the two pullers gate on.
//   3) The idle-in-transaction anti-pattern that caused Sentry IH35-TMS-PROD-25 (a per-row await loop
//      holding one withLuciaBypass txn open across tens of thousands of round-trips) is ABSENT from both
//      projectPurchasesToExpenses() and projectArPaymentsToLedger() — the #3433 root fix (set-based
//      INSERT…SELECT) must stay in place. FAILs on pre-#3433 shape; PASSes on the current fixed shape.
//   4) docs/module-completion/accounting.md explicitly records ACCT-ECON-03/ACCT-ECON-04 as FAIL-BY-DESIGN
//      with the flags-OFF-by-owner-design reason — so no future session mistakes the 0-count for a defect
//      to chase (Rule 21 owner-word: honest FAIL-by-design beats a fake-green subledger).
//
// --selftest mutates REAL source strings (not synthetic fixtures) to reintroduce the idle-in-txn loop, to
// flip a flag's registered default to true, and to strip the FAIL-by-design doc language — each assertion
// must independently flag its planted defect, and the current on-disk shape must NOT be flagged.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.VERIFY_PROJECTION_FLAGS_OFF_ROOT
  ? path.resolve(process.env.VERIFY_PROJECTION_FLAGS_OFF_ROOT)
  : path.resolve(__dirname, "..");

const PURCHASES_PULLER_REL = "apps/backend/src/qbo-sync/qbo-purchases-puller.ts";
const AR_PULLER_REL = "apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts";
const FLAG_SERVICE_REL = "apps/backend/src/lib/feature-flags/service.ts";
const ACCOUNTING_MD_REL = "docs/module-completion/accounting.md";
const ACCOUNTING_JSON_REL = "docs/module-completion/accounting.json";
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

const EXPENSES_FLAG = "QBO_EXPENSES_PROJECTION_ENABLED";
const AR_FLAG = "QBO_AR_PAYMENTS_PROJECTION_ENABLED";
const FLAGS = [EXPENSES_FLAG, AR_FLAG];

// A single-row-in-loop-with-open-txn shape: iterating mirror rows and awaiting a DB call per iteration
// inside what was one long-lived transaction — the exact mechanism that produced idle_in_transaction on
// prod (IH35-TMS-PROD-25). Matches `for (...) { ... await client.query(...) ... }` / `for await` loops.
const PER_ROW_LOOP_RE = /for\s*(?:await\s*)?\(\s*(?:const|let)\s+\w+\s+of\s+\w+(?:\.\w+)?\s*\)\s*\{[^}]*await\s+client\.query/;

function readOrNull(rel, root = ROOT) {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

/**
 * Extract the body of a named exported async function (best-effort, brace-counting).
 *
 * Must skip past the PARAMETER LIST first (which may itself contain a `{}` default value, e.g.
 * `context: FeatureFlagContext = {}`) before looking for the body-opening brace — otherwise the first
 * `{` found could be an empty default-value object, not the function body.
 */
function extractFunctionBody(text, fnName) {
  const marker = `export async function ${fnName}`;
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const parenStart = text.indexOf("(", start);
  if (parenStart < 0) return null;
  // Walk the parameter list, counting parens (default-value braces don't affect paren depth).
  let parenDepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < text.length; i += 1) {
    if (text[i] === "(") parenDepth += 1;
    else if (text[i] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        parenEnd = i;
        break;
      }
    }
  }
  if (parenEnd < 0) return null;
  // Between the closing paren and the body, there may be a `: ReturnType<...>` annotation — skip to the
  // first `{` after that (the return-type annotation itself never contains `{`).
  const braceStart = text.indexOf("{", parenEnd);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(braceStart, i + 1);
    }
  }
  return text.slice(braceStart);
}

/**
 * Assertion 3: the idle-in-txn anti-pattern must be absent from a projection function, and the set-based
 * INSERT…SELECT replacement must be present.
 */
export function analyzeProjectionFunction(text, fnName, insertTable, sourceTable) {
  const failures = [];
  const body = extractFunctionBody(text, fnName);
  if (!body) {
    failures.push(`missing export async function ${fnName} — projection stage is gone or renamed.`);
    return failures;
  }
  if (PER_ROW_LOOP_RE.test(body)) {
    failures.push(
      `${fnName} contains a per-row loop awaiting a DB call inside an open transaction — this is the exact ` +
        `idle_in_transaction anti-pattern (Sentry IH35-TMS-PROD-25) #3433 fixed. It must NOT return.`
    );
  }
  const insertRe = new RegExp(`INSERT\\s+INTO\\s+${insertTable.replace(".", "\\.")}`, "i");
  const fromRe = new RegExp(`FROM\\s+${sourceTable.replace(".", "\\.")}`, "i");
  if (!insertRe.test(body) || !fromRe.test(body)) {
    failures.push(
      `${fnName} must remain a set-based INSERT INTO ${insertTable} … FROM ${sourceTable} (no per-row round trips).`
    );
  }
  return failures;
}

/** Assertion 1: both flags registered default_enabled=false; no migration seeds a per-entity ON override. */
export function analyzeMigrations(migrationsBySql) {
  const failures = [];
  const allSql = migrationsBySql.map((m) => m.sql).join("\n");

  for (const flag of FLAGS) {
    // Find `'FLAG_KEY', ... , false|true, ...)` tuples inside an INSERT INTO lib.feature_flags VALUES list.
    // Scoped per-flag: locate the flag's string literal, then look at the tuple content immediately
    // following it up to the next top-level `)` before the next flag key or `ON CONFLICT`.
    const flagLiteralRe = new RegExp(`'${flag}'`, "g");
    let matched = false;
    let sawDefaultTrue = false;
    for (const m of allSql.matchAll(flagLiteralRe)) {
      matched = true;
      const tupleWindow = allSql.slice(m.index, m.index + 900);
      // default_enabled is the boolean literal immediately preceding rollout_pct's numeric literal in the
      // VALUES tuple: ('FLAG', 'description ... ', <default_enabled>, <rollout_pct>)
      const boolMatch = tupleWindow.match(/,\s*(true|false)\s*,\s*\d+\s*\)/);
      if (boolMatch && boolMatch[1] === "true") sawDefaultTrue = true;
    }
    if (!matched) {
      failures.push(`No migration registers ${flag} in lib.feature_flags — cannot verify default-OFF.`);
      continue;
    }
    if (sawDefaultTrue) {
      failures.push(`A migration registers ${flag} with default_enabled=true — flags must stay default OFF by owner design.`);
    }
  }

  // Build-and-HOLD: no migration may seed a per-entity ON override for either flag.
  const overrideOnRe = /INSERT\s+INTO\s+lib\.feature_flag_overrides[\s\S]{0,400}?enabled[\s\S]{0,40}?true/i;
  for (const { file, sql } of migrationsBySql) {
    for (const flag of FLAGS) {
      if (
        sql.includes(flag) &&
        overrideOnRe.test(sql) &&
        (new RegExp(`feature_flag_overrides[\\s\\S]*${flag}`).test(sql) ||
          new RegExp(`${flag}[\\s\\S]*feature_flag_overrides`).test(sql))
      ) {
        failures.push(`${file} seeds a feature_flag_overrides ON for ${flag} — build-and-HOLD forbids seeding ON; the owner flips it per-entity.`);
      }
    }
  }
  return failures;
}

/** Assertion 2: isEnabled() resolves an absent flag row to false (SAFE-OFF), not true. */
export function analyzeFlagService(text) {
  const failures = [];
  const start = text.indexOf("export async function isEnabled");
  if (start < 0) {
    failures.push("feature-flags/service.ts missing export async function isEnabled — cannot verify SAFE-OFF default.");
    return failures;
  }
  const body = extractFunctionBody(text, "isEnabled");
  if (!body) {
    failures.push("could not extract isEnabled() body.");
    return failures;
  }
  // Must short-circuit to false when no flag row is found, BEFORE consulting any override/rollout.
  if (!/if\s*\(\s*!flag\s*\)\s*return\s+false\s*;/.test(body)) {
    failures.push(
      "isEnabled() no longer short-circuits an absent flag row to `false` — an unregistered/mis-seeded flag " +
        "could silently resolve enabled, defeating SAFE-OFF."
    );
  }
  return failures;
}

/** Assertion 4: accounting.md/json record ECON-03/04 as FAIL-BY-DESIGN with the owner-design reason. */
export function analyzeAccountingDocs(mdText, jsonText) {
  const failures = [];
  if (!mdText) {
    failures.push(`${ACCOUNTING_MD_REL} missing — cannot verify FAIL-by-design record.`);
  } else {
    if (!/ACCT-ECON-03/.test(mdText) || !/ACCT-ECON-04/.test(mdText)) {
      failures.push(`${ACCOUNTING_MD_REL} no longer lists ACCT-ECON-03/ACCT-ECON-04.`);
    }
    if (!/FAIL-BY-DESIGN/i.test(mdText)) {
      failures.push(
        `${ACCOUNTING_MD_REL} does not say FAIL-BY-DESIGN anywhere — ECON-03/04 must be recorded as an honest ` +
          "owner-design FAIL, not left looking like an open bug."
      );
    }
    if (!/OWNER DESIGN|owner design|OFF by owner/i.test(mdText)) {
      failures.push(`${ACCOUNTING_MD_REL} does not explain the flags are OFF BY OWNER DESIGN.`);
    }
  }
  if (jsonText) {
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      failures.push(`${ACCOUNTING_JSON_REL} is not valid JSON.`);
      data = null;
    }
    if (data) {
      const econ03 = data.items?.find((it) => it.id === "ACCT-ECON-03");
      const econ04 = data.items?.find((it) => it.id === "ACCT-ECON-04");
      for (const [id, item] of [
        ["ACCT-ECON-03", econ03],
        ["ACCT-ECON-04", econ04],
      ]) {
        if (!item) {
          failures.push(`${ACCOUNTING_JSON_REL} missing item ${id}.`);
          continue;
        }
        if (item.status === "PASS") {
          failures.push(`${ACCOUNTING_JSON_REL} ${id} was flipped to PASS — flags are OFF by design, the subledger is still honestly 0; this must stay FAIL.`);
        }
        if (!/FAIL-BY-DESIGN/i.test(item.evidence || "")) {
          failures.push(`${ACCOUNTING_JSON_REL} ${id}.evidence does not say FAIL-BY-DESIGN.`);
        }
      }
    }
  }
  return failures;
}

function loadMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }));
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  // --- Assertion 3 selftest: mutate REAL source (read from disk) to reintroduce the idle-in-txn loop ---
  const realPurchasesSrc = readOrNull(PURCHASES_PULLER_REL);
  const realArSrc = readOrNull(AR_PULLER_REL);
  if (!realPurchasesSrc || !realArSrc) {
    failures.push("selftest could not read real puller source files to mutate.");
  } else {
    // Case A: current on-disk shape must NOT be flagged.
    const purchasesOk = analyzeProjectionFunction(
      realPurchasesSrc,
      "projectPurchasesToExpenses",
      "accounting.expenses",
      "mdata.qbo_purchases"
    );
    if (purchasesOk.length !== 0) failures.push(`real projectPurchasesToExpenses flagged when it should PASS: ${purchasesOk.join(" | ")}`);

    const arOk = analyzeProjectionFunction(
      realArSrc,
      "projectArPaymentsToLedger",
      "accounting.payments",
      "mdata.qbo_ar_payments"
    );
    if (arOk.length !== 0) failures.push(`real projectArPaymentsToLedger flagged when it should PASS: ${arOk.join(" | ")}`);

    // Case B: mutate a REAL copy — replace the set-based INSERT…SELECT with a per-row await loop (the
    // exact pre-#3433 shape) and assert it IS flagged.
    const bodyStart = realPurchasesSrc.indexOf("export async function projectPurchasesToExpenses");
    const bodyEnd = realPurchasesSrc.indexOf("\nexport ", bodyStart + 10);
    const mutatedBadLoop =
      realPurchasesSrc.slice(0, bodyStart) +
      `export async function projectPurchasesToExpenses(operatingCompanyId) {
        const mirror = await client.query('SELECT * FROM mdata.qbo_purchases');
        for (const m of mirror.rows) {
          await client.query('INSERT INTO accounting.expenses (...) VALUES (...)', [m]);
        }
      }\n` +
      (bodyEnd > 0 ? realPurchasesSrc.slice(bodyEnd) : "");
    const badLoopFindings = analyzeProjectionFunction(
      mutatedBadLoop,
      "projectPurchasesToExpenses",
      "accounting.expenses",
      "mdata.qbo_purchases"
    );
    if (badLoopFindings.length === 0) failures.push("selftest: reintroduced idle-in-txn per-row loop was NOT flagged.");

    // Case C: strip the function entirely — must be flagged as missing.
    const removedFn = realArSrc.replace(/export async function projectArPaymentsToLedger[\s\S]*$/, "// removed");
    const removedFindings = analyzeProjectionFunction(
      removedFn,
      "projectArPaymentsToLedger",
      "accounting.payments",
      "mdata.qbo_ar_payments"
    );
    if (removedFindings.length === 0) failures.push("selftest: removed projectArPaymentsToLedger was NOT flagged.");
  }

  // --- Assertion 1 selftest: mutate REAL migration SQL to claim default_enabled=true ---
  const realMigrations = loadMigrations();
  if (realMigrations.length === 0) {
    failures.push("selftest could not read real migrations dir.");
  } else {
    const goodFindings = analyzeMigrations(realMigrations);
    if (goodFindings.length !== 0) failures.push(`real migrations flagged when they should PASS: ${goodFindings.join(" | ")}`);

    const mutatedMigrations = realMigrations.map((m) =>
      m.sql.includes(EXPENSES_FLAG)
        ? { file: m.file, sql: m.sql.replace(/('QBO_EXPENSES_PROJECTION_ENABLED'[\s\S]{0,900}?),\s*false\s*,(\s*\d+\s*\))/, "$1, true,$2") }
        : m
    );
    const mutatedFindings = analyzeMigrations(mutatedMigrations);
    if (!mutatedFindings.some((f) => f.includes(EXPENSES_FLAG) && f.includes("default_enabled=true"))) {
      failures.push(`selftest: default_enabled=true mutation for ${EXPENSES_FLAG} was NOT flagged.`);
    }

    // No-registration case.
    const noReg = realMigrations.map((m) => ({ file: m.file, sql: m.sql.replace(new RegExp(AR_FLAG, "g"), "SOMETHING_ELSE") }));
    const noRegFindings = analyzeMigrations(noReg);
    if (!noRegFindings.some((f) => f.includes(AR_FLAG))) {
      failures.push(`selftest: un-registering ${AR_FLAG} was NOT flagged.`);
    }
  }

  // --- Assertion 2 selftest: mutate REAL feature-flag service to remove the SAFE-OFF short-circuit ---
  const realFlagService = readOrNull(FLAG_SERVICE_REL);
  if (!realFlagService) {
    failures.push("selftest could not read real feature-flags/service.ts.");
  } else {
    const goodSvc = analyzeFlagService(realFlagService);
    if (goodSvc.length !== 0) failures.push(`real isEnabled() flagged when it should PASS: ${goodSvc.join(" | ")}`);

    const mutatedSvc = realFlagService.replace(/if\s*\(\s*!flag\s*\)\s*return\s+false\s*;/, "// safe-off removed");
    const badSvc = analyzeFlagService(mutatedSvc);
    if (badSvc.length === 0) failures.push("selftest: removing the isEnabled() SAFE-OFF short-circuit was NOT flagged.");
  }

  // --- Assertion 4 selftest: mutate REAL accounting.md/json to strip FAIL-BY-DESIGN language ---
  const realMd = readOrNull(ACCOUNTING_MD_REL);
  const realJson = readOrNull(ACCOUNTING_JSON_REL);
  if (!realMd || !realJson) {
    failures.push("selftest could not read real docs/module-completion/accounting.{md,json}.");
  } else {
    const goodDocs = analyzeAccountingDocs(realMd, realJson);
    if (goodDocs.length !== 0) failures.push(`real accounting docs flagged when they should PASS: ${goodDocs.join(" | ")}`);

    const strippedMd = realMd.replace(/FAIL-BY-DESIGN/gi, "FAIL");
    const strippedFindings = analyzeAccountingDocs(strippedMd, realJson);
    if (!strippedFindings.some((f) => f.includes("FAIL-BY-DESIGN"))) {
      failures.push("selftest: stripping FAIL-BY-DESIGN from accounting.md was NOT flagged.");
    }

    const flippedJson = realJson.replace(
      /("id":\s*"ACCT-ECON-03"[\s\S]{0,400}?"status":\s*)"FAIL"/,
      '$1"PASS"'
    );
    const flippedFindings = analyzeAccountingDocs(realMd, flippedJson);
    if (!flippedFindings.some((f) => f.includes("flipped to PASS"))) {
      failures.push("selftest: flipping ACCT-ECON-03 to PASS in accounting.json was NOT flagged.");
    }
  }

  if (failures.length > 0) {
    console.error("verify-projection-flags-off-by-design --selftest: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-projection-flags-off-by-design --selftest: PASS");
  process.exit(0);
}

// ── Real run ──────────────────────────────────────────────────────────────────────────────────────────
const failures = [];

const purchasesSrc = readOrNull(PURCHASES_PULLER_REL);
if (!purchasesSrc) failures.push(`missing ${PURCHASES_PULLER_REL}`);
else failures.push(...analyzeProjectionFunction(purchasesSrc, "projectPurchasesToExpenses", "accounting.expenses", "mdata.qbo_purchases"));

const arSrc = readOrNull(AR_PULLER_REL);
if (!arSrc) failures.push(`missing ${AR_PULLER_REL}`);
else failures.push(...analyzeProjectionFunction(arSrc, "projectArPaymentsToLedger", "accounting.payments", "mdata.qbo_ar_payments"));

const flagServiceSrc = readOrNull(FLAG_SERVICE_REL);
if (!flagServiceSrc) failures.push(`missing ${FLAG_SERVICE_REL}`);
else failures.push(...analyzeFlagService(flagServiceSrc));

failures.push(...analyzeMigrations(loadMigrations()));

const accountingMd = readOrNull(ACCOUNTING_MD_REL);
const accountingJson = readOrNull(ACCOUNTING_JSON_REL);
failures.push(...analyzeAccountingDocs(accountingMd, accountingJson));

if (failures.length > 0) {
  console.error("verify-projection-flags-off-by-design: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-projection-flags-off-by-design: PASS (QBO_EXPENSES_PROJECTION_ENABLED + QBO_AR_PAYMENTS_PROJECTION_ENABLED " +
    "default OFF; SAFE-OFF resolver intact; #3433 set-based fix intact; ACCT-ECON-03/04 recorded FAIL-BY-DESIGN)"
);
process.exit(0);
