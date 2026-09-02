#!/usr/bin/env node
/**
 * SWEEP-C6 (CLASS-SWEEP 2026-07-25) — money INSERT / money event without balanced-JE poster.
 *
 * THE CLASS: every money-table write (and planted money-event anchors outside accounting.*)
 * must route through the EXISTING poster (no new GL math). Confirmed seeds today:
 *   - maintenance parts-purchase
 *   - warranty reimburse
 *   - company-paid civil fine link-payment (SAF-B18 / #3551 — fold into C6, do not merge solo)
 *   - WO two-section → accounting.bills/expenses without poster
 *
 * GUARD-FIRST: selftest FAILS on planted no-poster fixtures. Live tree uses a SHRINK-ONLY
 * baseline (scripts/verify-sweep-c6-money-insert-requires-je-poster.baseline.json) so today
 * can merge; NEW gaps fail CI; fixing a gap means removing its key from the baseline.
 * `--strict` fails on every gap including baselined (GUARD inventory mode).
 *
 * Exempt: inline `C6-MONEY-JE-EXEMPT: <reason>` in the file.
 * Rule 17: wired ONLY via scripts/verify-steps/1503-*.mjs
 *
 * Usage:
 *   node scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs --selftest
 *   node scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs
 *   UPDATE_C6_MONEY_JE_BASELINE=1 node scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs
 *   node scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs --strict
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-sweep-c6-money-insert-requires-je-poster";
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");
const BASELINE = path.join(ROOT, "scripts", "verify-sweep-c6-money-insert-requires-je-poster.baseline.json");

/** Subledger / cash / AR-AP money tables — INSERT here without a poster is a C6 gap. */
const MONEY_TABLES = [
  "bills",
  "bill_lines",
  "bill_payments",
  "expenses",
  "expense_lines",
  "invoices",
  "invoice_lines",
  "payments",
  "payment_applications",
  "journal_entries",
  "journal_entry_lines",
  "journal_entry_postings",
  "factoring_advances",
  "factoring_reserve_movements",
  "property_tax_accruals",
  "escrow_postings",
  "escrow_accounts",
  "bank_transactions",
  "bank_transaction_splits",
  "escrow_ledger",
  "escrow_balances",
  "settlement_lines",
  "driver_settlement_deductions",
  "driver_advances",
  "driver_liabilities",
  "abandonment_chargebacks",
];

const MONEY_SCHEMA_TABLE = `(?:accounting|banking|driver_finance)\\.(?:${MONEY_TABLES.join("|")})`;
const MONEY_INSERT_RE = new RegExp(`\\bINSERT\\s+INTO\\s+${MONEY_SCHEMA_TABLE}\\b`, "gi");

/** Existing poster / JE writers — reuse only; no new GL math. */
const POSTER_RE =
  /postSourceTransaction(?:InClientTx)?|createJournalEntry(?:OnClient)?|postBillGlIfEnabled|postVoidReversal|maybePostBankCategorizationToGl|postFuelExpenseFromEvent|postFactoring(?:Advance|FeeExpense|CustomerPayment|Release|Chargeback|DefaultInterest)Event|processMaintenanceWorkOrderClose|postPropertyTax(?:Accrual|Payment)|postDepreciation|recordEscrowPostingOnly|apply_escrow_posting|postWarrantyReimbursement|postPartsInventoryPurchase|postCompanyPaidCivilFine|posting-engine\.service|from\s+["'][^"']*posting-engine|postSettlementToGl|createCorrectiveJournalEntry|postBillPaymentGlIfEnabled/;

const EXEMPT_RE = /C6-MONEY-JE-EXEMPT:/;

/**
 * Layer B — money events that never INSERT accounting.* yet move cash/P&L.
 * Marker must appear in the file; same poster/exempt rules apply.
 */
const PLANTED_ANCHORS = [
  {
    id: "parts-purchase",
    fileIncludes: "maintenance/parts-inventory.routes.ts",
    marker: /\/api\/v1\/maintenance\/parts-inventory\/purchases|INSERT\s+INTO\s+maintenance\.parts_inventory/i,
  },
  {
    id: "warranty-reimburse",
    fileIncludes: "maintenance/warranty.routes.ts",
    marker: /\/api\/v1\/maintenance\/warranty\/claims\/:id\/reimburse|reimbursement_amount_cents/i,
  },
  {
    id: "fine-link-payment",
    fileIncludes: "safety/fines.routes.ts",
    marker: /\/api\/v1\/safety\/fines\/:id\/link-payment|link-payment/i,
  },
];

/**
 * Confirmed seeds that must remain in the baseline UNTIL fixed (then they shrink out).
 * parts-inventory + fines are FIXED (MNT-ECON-01 / #3551) — removed from this list so
 * UPDATE_C6_MONEY_JE_BASELINE can shrink honestly.
 */
const REQUIRED_SEED_SUBSTR = [
  "two-section-service.ts",
];

function isTestPath(relPath) {
  return /__tests__|\.test\.ts$|\.spec\.ts$|\.deprecated\.ts$/.test(relPath);
}

function walkTsFiles(dir, root, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walkTsFiles(full, root, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return out;
}

function hasPoster(content) {
  return POSTER_RE.test(content);
}

function isExempt(content) {
  return EXEMPT_RE.test(content);
}

/**
 * @param {Record<string, string>} files relPath (under apps/backend/src) → source
 * @returns {{ gaps: string[], evaluated: string[] }}
 */
export function findC6Gaps(files) {
  const gaps = [];
  const evaluated = [];

  for (const [relPath, content] of Object.entries(files)) {
    if (isTestPath(relPath)) continue;

    // Layer A — money-table INSERT
    MONEY_INSERT_RE.lastIndex = 0;
    const moneyInserts = content.match(MONEY_INSERT_RE);
    if (moneyInserts && moneyInserts.length > 0) {
      evaluated.push(relPath);
      if (!hasPoster(content) && !isExempt(content)) {
        const tables = [...new Set(moneyInserts.map((s) => s.replace(/\s+/g, " ")))];
        gaps.push(
          `${relPath}::INSERT ${tables.join("|")} — money-table INSERT with no balanced-JE poster ` +
            `(postSourceTransaction / createJournalEntry / …) and no C6-MONEY-JE-EXEMPT`
        );
      }
    }

    // Layer B — planted anchors (exact relative path under apps/backend/src)
    for (const anchor of PLANTED_ANCHORS) {
      if (relPath !== anchor.fileIncludes) continue;
      if (!anchor.marker.test(content)) continue;
      const key = `${relPath}::ANCHOR ${anchor.id}`;
      if (!evaluated.includes(relPath)) evaluated.push(relPath);
      if (hasPoster(content) || isExempt(content)) continue;
      if (!gaps.some((g) => g.startsWith(key))) {
        gaps.push(
          `${key} — money event '${anchor.id}' with no balanced-JE poster and no C6-MONEY-JE-EXEMPT ` +
            `(SWEEP-C6 confirmed seed)`
        );
      }
    }
  }

  return { gaps: [...new Set(gaps)].sort(), evaluated };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  try {
    return new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")).keys ?? []);
  } catch {
    return null;
  }
}

function gapKey(gapLine) {
  // Stable key = path::kind (before the em-dash reason)
  const m = /^([^—]+)/.exec(gapLine);
  return (m ? m[1] : gapLine).trim();
}

export function runAgainstFiles(files, { strict = false, baseline = null } = {}) {
  const { gaps, evaluated } = findC6Gaps(files);
  if (strict || !baseline) {
    return { failures: gaps, gaps, evaluated, known: [] };
  }
  const known = [];
  const failures = [];
  for (const g of gaps) {
    const k = gapKey(g);
    if (baseline.has(k)) known.push(g);
    else failures.push(g);
  }
  // Vanish check: baseline keys that no longer exist may shrink (OK). Do not fail on shrink.
  return { failures, gaps, evaluated, known };
}

function loadRealFiles() {
  const relFiles = walkTsFiles(BACKEND_SRC, BACKEND_SRC, []);
  /** @type {Record<string, string>} */
  const files = {};
  for (const rel of relFiles) {
    files[rel] = fs.readFileSync(path.join(BACKEND_SRC, rel), "utf8");
  }
  return files;
}

function writeBaseline(gaps) {
  const keys = [...new Set(gaps.map(gapKey))].sort();
  const missingSeeds = REQUIRED_SEED_SUBSTR.filter((s) => !keys.some((k) => k.includes(s)));
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          "SWEEP-C6 shrink-only baseline — money INSERT / planted money events without a JE poster. " +
          "Regenerate: UPDATE_C6_MONEY_JE_BASELINE=1. NEW keys fail CI; list may only shrink as gaps are fixed. " +
          "Exempt with inline C6-MONEY-JE-EXEMPT: <reason>. Confirmed seeds: parts-purchase, warranty, " +
          "fine-link-payment (#3551→C6), two-section bills/expenses.",
        generated_at: new Date().toISOString(),
        count: keys.length,
        required_seeds_present: missingSeeds.length === 0,
        missing_seeds: missingSeeds,
        keys,
      },
      null,
      2
    ) + "\n"
  );
  return { keys, missingSeeds };
}

function selftest() {
  const cases = [
    {
      label: "(i) money INSERT, no poster → FAIL",
      files: {
        "accounting/bad-bill.ts": `
          await client.query(\`INSERT INTO accounting.bills (id, total_cents) VALUES ($1,$2)\`, [a,b]);
        `,
      },
      expectFail: true,
    },
    {
      label: "(ii) money INSERT + postSourceTransaction → PASS",
      files: {
        "accounting/good-bill.ts": `
          await client.query(\`INSERT INTO accounting.bills (id, total_cents) VALUES ($1,$2)\`, [a,b]);
          await postSourceTransaction(client, { sourceType: "bill", sourceId: id });
        `,
      },
      expectFail: false,
    },
    {
      label: "(iii) money INSERT + C6-MONEY-JE-EXEMPT → PASS",
      files: {
        "qbo-sync/pull-bills.ts": `
          // C6-MONEY-JE-EXEMPT: qbo-mirror-import; parallel books — no TMS JE
          await client.query(\`INSERT INTO accounting.bills (id) VALUES ($1)\`, [id]);
        `,
      },
      expectFail: false,
    },
    {
      label: "(iv) planted parts-purchase without poster → FAIL",
      files: {
        "maintenance/parts-inventory.routes.ts": `
          app.post("/api/v1/maintenance/parts-inventory/purchases", async () => {
            await client.query(\`INSERT INTO maintenance.parts_inventory (id) VALUES ($1)\`, [id]);
          });
        `,
      },
      expectFail: true,
    },
    {
      label: "(v) planted fine link-payment without poster → FAIL",
      files: {
        "safety/fines.routes.ts": `
          app.post("/api/v1/safety/fines/:id/link-payment", async () => {
            await client.query(\`UPDATE safety.civil_fines SET status = 'paid'\`, []);
          });
        `,
      },
      expectFail: true,
    },
    {
      label: "(vi) __tests__ money INSERT → not evaluated",
      files: {
        "accounting/__tests__/bill.db.test.ts": `
          await client.query(\`INSERT INTO accounting.bills (id) VALUES ($1)\`, [id]);
        `,
      },
      expectFail: false,
      expectEvaluated: 0,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const { gaps, evaluated } = findC6Gaps(c.files);
    const failed = gaps.length > 0;
    const ok = failed === c.expectFail;
    const evalOk = c.expectEvaluated === undefined || evaluated.length === c.expectEvaluated;
    if (ok && evalOk) {
      pass++;
      console.log(`ok    ${c.label}`);
    } else {
      console.error(
        `FAIL  ${c.label} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}\n` +
          `      ${gaps.join("\n      ")}`
      );
    }
  }
  console.log(`\n${LABEL} SELFTEST ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    selftest();
    return;
  }

  if (!fs.existsSync(BACKEND_SRC)) {
    console.error(`[${LABEL}] FAIL — ${BACKEND_SRC} not found`);
    process.exit(1);
  }

  const files = loadRealFiles();
  const { gaps } = findC6Gaps(files);

  if (process.env.UPDATE_C6_MONEY_JE_BASELINE === "1") {
    const { keys, missingSeeds } = writeBaseline(gaps);
    console.log(`[${LABEL}] baseline written: ${keys.length} known C6 gap(s).`);
    if (missingSeeds.length) {
      console.error(`[${LABEL}] WARN — required seeds missing from inventory: ${missingSeeds.join(", ")}`);
      process.exit(1);
    }
    process.exit(0);
  }

  const strict = args.includes("--strict");
  const baseline = loadBaseline();
  if (!strict && !baseline) {
    console.error(
      `[${LABEL}] FAIL — baseline missing (${path.relative(ROOT, BASELINE)}). ` +
        `Run: UPDATE_C6_MONEY_JE_BASELINE=1 node scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs`
    );
    process.exit(1);
  }

  const result = runAgainstFiles(files, { strict, baseline });

  // Always print inventory of known (baselined) gaps — the true class list.
  if (!strict && result.known.length) {
    console.log(`[${LABEL}] baselined C6 gaps still open (shrink-only): ${result.known.length}`);
    for (const g of result.known.slice(0, 40)) console.log(`  · ${g}`);
    if (result.known.length > 40) console.log(`  · … +${result.known.length - 40} more`);
  }

  if (result.failures.length) {
    console.error(`[${LABEL}] FAIL — ${result.failures.length} ${strict ? "" : "NEW "}C6 gap(s):`);
    for (const f of result.failures) console.error(`  ✗ ${f}`);
    console.error(
      `\nSWEEP-C6: every money write must call the existing poster (postSourceTransaction / ` +
        `createJournalEntry / …) behind the per-entity flag, or carry C6-MONEY-JE-EXEMPT: <reason>. ` +
        `Do NOT open solo money-poster PRs — fold into C6 (incl. #3551 fine-GL + SAF-B18).`
    );
    process.exit(1);
  }

  console.log(
    `[${LABEL}] OK — ${Object.keys(files).length} backend files scanned; ` +
      `${result.evaluated.length} money writer(s) evaluated; ` +
      (strict
        ? "zero gaps (strict)."
        : `${result.known.length} baselined gap(s) remaining (shrink-only ratchet).`)
  );
}

main();
