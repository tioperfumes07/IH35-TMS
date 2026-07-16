#!/usr/bin/env node
/**
 * verify-banking-nav-clickthrough.mjs (Doc-18 defects #10/#11/#12)
 *
 * Root cause it locks: the owner observed live in Banking that (a) there was no "Bank Register" and no
 * "Chart of Accounts" button anywhere in the Banking module — QBO surfaces both — so Chart of Accounts
 * was only reachable via the unrelated Lists module, and (b) the Driver Escrow ledger register
 * (DriverEscrowTabContent) rendered plain <tr> rows with NO onClick at all — a dead click, unlike every
 * other register surface in Banking (BankAccountDetail / BankingTransactionsDesignView / AccountRegisterPage),
 * which are all already click-through per prior KEYSTONE fixes.
 *
 * This guard asserts, so it can never regress:
 *   1. BankingHome.tsx renders a persistent "Bank Register" action that opens the real GL register
 *      (QBO parity: pre-bound `/accounting/chart-of-accounts/register/:ledgerAccountId` via the selected
 *      bank's ledger_account_id; legacy unbound `/accounting/account-register` also accepted) AND a
 *      persistent "Chart of Accounts" action (/lists/accounting/chart-of-accounts) — both present
 *      regardless of which Banking tab is active.
 *   2. DriverEscrowTabContent.tsx's register <tr> rows carry a real onClick / row-navigation handler
 *      (not a dead click) — clicking a row must go somewhere.
 *
 * Self-test (pure logic against synthetic inputs): node scripts/verify-banking-nav-clickthrough.mjs --selftest
 * LINKAGE: Banking nav parity with QBO (Bank Register + Chart of Accounts) + register row click-through.
 * Additive only — no existing action was removed.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BANKING_HOME_REL = "apps/frontend/src/pages/banking/BankingHome.tsx";
const ESCROW_TAB_REL = "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx";

/**
 * Pure evaluation core (unit-testable / self-testable).
 * @param {{bankingHomeSrc:string, escrowTabSrc:string}} input
 * @returns {string[]} failures (empty => pass)
 */
export function assertGuard({ bankingHomeSrc, escrowTabSrc }) {
  const failures = [];

  // (1) Bank Register button — a persistent nav action, not buried behind a single tab.
  if (!/Bank Register/.test(bankingHomeSrc)) {
    failures.push(`${BANKING_HOME_REL} — no "Bank Register" action found (Doc-18 defect #10)`);
  }
  if (
    !/navigate\(\s*[`'"]\/accounting\/chart-of-accounts\/register\//.test(bankingHomeSrc) &&
    !/navigate\(\s*["']\/accounting\/account-register["']\s*\)/.test(bankingHomeSrc)
  ) {
    failures.push(
      `${BANKING_HOME_REL} — "Bank Register" must open the GL register (pre-bound /accounting/chart-of-accounts/register/:id preferred; /accounting/account-register accepted)`
    );
  }

  // (2) Chart of Accounts button — a persistent nav action (Doc-18 defects #10/#11: COA was only
  // reachable via Lists before this fix).
  if (!/Chart of Accounts/.test(bankingHomeSrc)) {
    failures.push(`${BANKING_HOME_REL} — no "Chart of Accounts" action found (Doc-18 defects #10/#11)`);
  }
  if (!/navigate\(\s*["']\/lists\/accounting\/chart-of-accounts["']\s*\)/.test(bankingHomeSrc)) {
    failures.push(`${BANKING_HOME_REL} — "Chart of Accounts" must navigate to /lists/accounting/chart-of-accounts`);
  }

  // Both actions must render OUTSIDE the per-tab ternary (i.e. unconditionally), so they show up no
  // matter which Banking tab is active — not just on one tab.
  if (!/const navActions\s*=/.test(bankingHomeSrc)) {
    failures.push(`${BANKING_HOME_REL} — Bank Register / Chart of Accounts must be a persistent nav action block (expected a \`navActions\` constant rendered on every tab), not folded into one tab's conditional actions`);
  }

  // (3) Driver Escrow register rows must be clickable (Doc-18 defect #12 — the dead-click regression).
  if (!/<tr[^>]*onClick=/.test(escrowTabSrc)) {
    failures.push(`${ESCROW_TAB_REL} — register <tr> rows have no onClick (dead click, Doc-18 defect #12)`);
  }
  if (!/navigate\(`\/drivers\/\$\{rowDriverId\}`\)/.test(escrowTabSrc)) {
    failures.push(`${ESCROW_TAB_REL} — expected the row click to drill through to the driver (/drivers/:id)`);
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function runReal() {
  const bankingHomeSrc = readRepo(BANKING_HOME_REL);
  const escrowTabSrc = readRepo(ESCROW_TAB_REL);
  const failures = assertGuard({ bankingHomeSrc, escrowTabSrc });
  if (failures.length > 0) {
    console.error("[verify-banking-nav-clickthrough] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    "[verify-banking-nav-clickthrough] OK — Banking has persistent Bank Register + Chart of Accounts nav actions, and the Driver Escrow register rows are click-through (no dead clicks)"
  );
}

function runSelftest() {
  const goodBankingHome = `
    const openBankRegister = () => {
      navigate(\`/accounting/chart-of-accounts/register/\${ledgerAccountId}\`);
    };
    const navActions = (
      <>
        <ActionButton onClick={openBankRegister}>Bank Register</ActionButton>
        <ActionButton onClick={() => navigate("/lists/accounting/chart-of-accounts")}>Chart of Accounts</ActionButton>
      </>
    );
  `;
  const goodEscrowTab = `
    <tr
      className={openable ? "cursor-pointer" : ""}
      onClick={openable ? () => navigate(\`/drivers/\${rowDriverId}\`) : undefined}
    >
  `;
  const cases = [
    {
      name: "healthy: persistent nav actions + clickable escrow rows",
      input: { bankingHomeSrc: goodBankingHome, escrowTabSrc: goodEscrowTab },
      expectPass: true,
    },
    {
      name: "regression: no Bank Register action",
      input: {
        bankingHomeSrc: goodBankingHome.replace(/Bank Register/g, "Something Else").replace(/chart-of-accounts\/register/g, "somewhere-else"),
        escrowTabSrc: goodEscrowTab,
      },
      expectPass: false,
    },
    {
      name: "regression: no Chart of Accounts action",
      input: {
        bankingHomeSrc: goodBankingHome.replace(/Chart of Accounts/g, "Nothing").replace(/chart-of-accounts/g, "nowhere"),
        escrowTabSrc: goodEscrowTab,
      },
      expectPass: false,
    },
    {
      name: "regression: nav actions folded back into a single tab's conditional (no persistent navActions block)",
      input: {
        bankingHomeSrc: goodBankingHome.replace("const navActions =", "const tabOnlyActions ="),
        escrowTabSrc: goodEscrowTab,
      },
      expectPass: false,
    },
    {
      name: "regression: escrow register row has no onClick (dead click)",
      input: {
        bankingHomeSrc: goodBankingHome,
        escrowTabSrc: '<tr className="border-t border-gray-100 text-xs">',
      },
      expectPass: false,
    },
    {
      name: "regression: escrow register row onClick doesn't drill to the driver",
      input: {
        bankingHomeSrc: goodBankingHome,
        escrowTabSrc: '<tr onClick={() => pushToast("noop")}>',
      },
      expectPass: false,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = assertGuard(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"} (${failures.join("; ")})`);
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("[verify-banking-nav-clickthrough] --selftest OK");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
