#!/usr/bin/env node
/**
 * Guard 6.3 + K-10 (443.113 / 443.115-C) — Insurance atomic financial-write pattern.
 * Scoped to:
 *   - policy-create-atomic.service.ts + policy-create-atomic.routes.ts
 *   - dispersal.routes.ts (generate-bills path)
 *
 * K-10 LAW: insurance creates A/P bills only. Never INSERT/UPDATE banking.bank_transactions
 * to invent a synthetic bank line against the oldest active account. The real bank line is
 * matched later (Owner Law B).
 *
 * Self-test: node scripts/verify-insurance-financial-writes.mjs --selftest
 */
import fs from "node:fs";
const BILL_WRITE_RE = /INSERT\s+INTO\s+accounting\.bills|insertBillHeaderOnClient\s*(?:<[^>]*>)?\s*\(/i;
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const SERVICE = "apps/backend/src/insurance/policy-create-atomic.service.ts";
const ROUTES = "apps/backend/src/insurance/policy-create-atomic.routes.ts";
const DISPERSAL = "apps/backend/src/insurance/dispersal.routes.ts";

const BANK_TX_WRITE =
  /\b(?:INSERT\s+INTO|UPDATE)\s+banking\.bank_transactions\b/i;
const BULK_POST = /\bbulkPostTransactionsAsBills\b/;
const SEED_BANK_ACCOUNT = /insurance_seed_bank_account_not_found|FROM\s+banking\.bank_accounts/i;

/** Strip line and block comments so prose naming forbidden APIs does not trip the guard. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function read(relativePath) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) return { missing: true, src: "" };
  return { missing: false, src: fs.readFileSync(abs, "utf8") };
}

/**
 * @param {{ serviceSrc?: string, routesSrc?: string, dispersalSrc?: string, missing?: string[] }} files
 * @returns {string[]}
 */
export function collectInsuranceFinancialWriteProblems(files) {
  const failures = [];
  const missing = files.missing ?? [];
  for (const m of missing) failures.push(`MISSING: ${m}`);

  const serviceSrc = stripComments(files.serviceSrc ?? "");
  const routesSrc = stripComments(files.routesSrc ?? "");
  const dispersalSrc = stripComments(files.dispersalSrc ?? "");

  if (serviceSrc) {
    if (!/computeInsuranceDispersal/.test(serviceSrc)) {
      failures.push(`${SERVICE}: must import and reference computeInsuranceDispersal`);
    }
    if (!/computeInsuranceDispersal\s*\(/.test(serviceSrc)) {
      failures.push(`${SERVICE}: must call computeInsuranceDispersal()`);
    }
    if (!/`ins:\$\{input\.policyId\}:\$\{bill\.sequence\}`/.test(serviceSrc)) {
      failures.push(
        `${SERVICE}: bill writes must use idempotency key ins:{policyId}:{seq} (template literal ins:\${input.policyId}:\${bill.sequence})`
      );
    }
    if (/INSERT\s+INTO\s+accounting\.journal/i.test(serviceSrc)) {
      failures.push(`${SERVICE}: must not contain raw INSERT INTO accounting.journal`);
    }
    if (BANK_TX_WRITE.test(serviceSrc)) {
      failures.push(
        `${SERVICE}: K-10 — must not INSERT/UPDATE banking.bank_transactions (insurance creates A/P bills only)`
      );
    }
    if (SEED_BANK_ACCOUNT.test(serviceSrc)) {
      failures.push(
        `${SERVICE}: K-10 — must not pick banking.bank_accounts to invent a seed transaction`
      );
    }
    // 443.182 C — the A/P bill is written through the one bill writer (insertBillHeaderOnClient) or inline.
    if (!BILL_WRITE_RE.test(serviceSrc)) {
      failures.push(`${SERVICE}: K-10 — must INSERT accounting.bills (A/P bills)`);
    }
  }

  if (routesSrc) {
    if (!/createInsurancePolicyWithBills/.test(routesSrc)) {
      failures.push(`${ROUTES}: must delegate to createInsurancePolicyWithBills`);
    }
    if (!/policy-create-atomic\.service/.test(routesSrc)) {
      failures.push(`${ROUTES}: must import policy-create-atomic.service`);
    }
    if (/INSERT\s+INTO\s+accounting\.journal/i.test(routesSrc)) {
      failures.push(`${ROUTES}: must not contain raw INSERT INTO accounting.journal`);
    }
    if (BANK_TX_WRITE.test(routesSrc)) {
      failures.push(`${ROUTES}: K-10 — must not INSERT/UPDATE banking.bank_transactions`);
    }
  }

  if (dispersalSrc) {
    if (BANK_TX_WRITE.test(dispersalSrc)) {
      failures.push(
        `${DISPERSAL}: K-10 — must not INSERT/UPDATE banking.bank_transactions (insurance creates A/P bills only)`
      );
    }
    if (BULK_POST.test(dispersalSrc)) {
      failures.push(
        `${DISPERSAL}: K-10 — must not call bulkPostTransactionsAsBills (that path invents bank lines)`
      );
    }
    if (SEED_BANK_ACCOUNT.test(dispersalSrc)) {
      failures.push(
        `${DISPERSAL}: K-10 — must not pick banking.bank_accounts to invent a seed transaction`
      );
    }
    if (!BILL_WRITE_RE.test(dispersalSrc)) {
      failures.push(`${DISPERSAL}: K-10 — must INSERT accounting.bills (A/P bills)`);
    }
    if (!/`ins:\$\{input\.policyId\}:\$\{bill\.sequence\}`/.test(dispersalSrc)) {
      failures.push(
        `${DISPERSAL}: bill writes must use idempotency key ins:{policyId}:{seq}`
      );
    }
  }

  return failures;
}

function analyzeLiveTree() {
  const service = read(SERVICE);
  const routes = read(ROUTES);
  const dispersal = read(DISPERSAL);
  const missing = [];
  if (service.missing) missing.push(SERVICE);
  if (routes.missing) missing.push(ROUTES);
  if (dispersal.missing) missing.push(DISPERSAL);
  return collectInsuranceFinancialWriteProblems({
    serviceSrc: service.src,
    routesSrc: routes.src,
    dispersalSrc: dispersal.src,
    missing,
  });
}

function selftest() {
  const baseline = analyzeLiveTree();
  if (baseline.length) {
    console.error("verify-insurance-financial-writes --selftest FAIL — live tree already red:");
    for (const f of baseline) console.error(`  • ${f}`);
    process.exit(1);
  }

  const liveService = read(SERVICE).src;
  const liveRoutes = read(ROUTES).src;
  const liveDispersal = read(DISPERSAL).src;

  const mutations = [
    {
      name: "service invents INSERT banking.bank_transactions",
      files: {
        serviceSrc:
          liveService +
          "\n  await client.query(`INSERT INTO banking.bank_transactions (id) VALUES ($1)`);\n",
        routesSrc: liveRoutes,
        dispersalSrc: liveDispersal,
      },
      expectSubstr: "K-10 — must not INSERT/UPDATE banking.bank_transactions",
    },
    {
      name: "service picks bank_accounts for seed",
      files: {
        serviceSrc:
          liveService.replace(
            "// K-10 (443.113 / 443.115-C) — insurance creates A/P bills only.",
            "const bankAccountRes = await client.query(`SELECT id FROM banking.bank_accounts WHERE operating_company_id = $1`);"
          ),
        routesSrc: liveRoutes,
        dispersalSrc: liveDispersal,
      },
      expectSubstr: "must not pick banking.bank_accounts",
    },
    {
      name: "dispersal invents UPDATE banking.bank_transactions",
      files: {
        serviceSrc: liveService,
        routesSrc: liveRoutes,
        dispersalSrc:
          liveDispersal +
          "\n  await client.query(`UPDATE banking.bank_transactions SET status = 'categorized' WHERE id = $1`);\n",
      },
      expectSubstr: "K-10 — must not INSERT/UPDATE banking.bank_transactions",
    },
    {
      name: "dispersal calls bulkPostTransactionsAsBills",
      files: {
        serviceSrc: liveService,
        routesSrc: liveRoutes,
        dispersalSrc:
          liveDispersal + "\n  await bulkPostTransactionsAsBills(client, input, userId);\n",
      },
      expectSubstr: "must not call bulkPostTransactionsAsBills",
    },
    {
      name: "dispersal drops accounting.bills INSERT",
      files: {
        serviceSrc: liveService,
        routesSrc: liveRoutes,
        dispersalSrc: liveDispersal
          .replace(/INSERT\s+INTO\s+accounting\.bills/gi, "INSERT INTO accounting.expenses")
          .replace(/insertBillHeaderOnClient\s*(?:<[^>]*>)?\s*\(/g, "insertExpenseHeader("),
      },
      expectSubstr: "must INSERT accounting.bills",
    },
  ];

  let caught = 0;
  for (const m of mutations) {
    const problems = collectInsuranceFinancialWriteProblems(m.files);
    const hit = problems.some((p) => p.includes(m.expectSubstr));
    if (!hit) {
      console.error(`verify-insurance-financial-writes --selftest FAIL — planted defect not caught: ${m.name}`);
      console.error(`  problems: ${problems.join(" | ") || "(none)"}`);
      process.exit(1);
    }
    caught += 1;
  }

  // Leftover plant: write a temp copy that invents bank_tx and confirm the analyzer would catch it
  // if the live tree regressed (no filesystem mutation of tracked sources).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "k10-ins-"));
  const plantPath = path.join(tmp, "plant.ts");
  fs.writeFileSync(
    plantPath,
    "INSERT INTO banking.bank_transactions (bank_account_id) VALUES ($1);\nINSERT INTO accounting.bills (id) VALUES ($1);\n"
  );
  const plantSrc = fs.readFileSync(plantPath, "utf8");
  const plantProblems = collectInsuranceFinancialWriteProblems({
    serviceSrc: plantSrc,
    routesSrc: liveRoutes,
    dispersalSrc: liveDispersal,
  });
  if (!plantProblems.some((p) => p.includes("K-10"))) {
    console.error("verify-insurance-financial-writes --selftest FAIL — leftover plant escaped");
    process.exit(1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(
    `verify-insurance-financial-writes --selftest PASS — ${caught}/${mutations.length} planted defects red + leftover plant`
  );
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyzeLiveTree();
  if (failures.length > 0) {
    console.error("verify-insurance-financial-writes FAIL:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-insurance-financial-writes OK — atomic service + dispersal create A/P bills only (K-10: no synthetic bank_transactions)"
  );
}
