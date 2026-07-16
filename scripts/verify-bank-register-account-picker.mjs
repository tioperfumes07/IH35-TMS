#!/usr/bin/env node
/**
 * verify-bank-register-account-picker.mjs (audit gap #5 — Bank Register unbound picker)
 *
 * Root cause it locks: Banking "Go to bank register" / Account Register landed unbound
 * ("Select an account…") instead of QBO's register?accountId=… pre-bind. The picker must
 * load bank accounts from GET /banking/accounts/all and honor ?accountId= (bank id →
 * ledger_account_id) in addition to the CoA route param.
 *
 * Asserts:
 *   1. AccountRegisterPage imports getAllAccounts and reads searchParams "accountId"
 *   2. AccountRegisterPage exposes resolveRegisterAccountId (bank → ledger_account_id)
 *   3. AccountRegisterPage picker renders a "Bank accounts" optgroup
 *   4. DesignView "Go to bank register" targets /accounting/account-register?accountId=
 *      (not the Plaid feed /banking/accounts/:id)
 *
 * Self-test: node scripts/verify-bank-register-account-picker.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REGISTER_PAGE_REL = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";
const DESIGN_VIEW_REL = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

/**
 * @param {{ registerSrc: string, designViewSrc: string }} input
 * @returns {string[]}
 */
export function assertGuard({ registerSrc, designViewSrc }) {
  const failures = [];

  if (!/getAllAccounts/.test(registerSrc)) {
    failures.push(`${REGISTER_PAGE_REL} — must call getAllAccounts (banking accounts API) for the register picker`);
  }
  if (!/searchParams\.get\(\s*["']accountId["']\s*\)/.test(registerSrc)) {
    failures.push(`${REGISTER_PAGE_REL} — must honor QBO-style ?accountId= deep link via searchParams.get("accountId")`);
  }
  if (!/export function resolveRegisterAccountId\b/.test(registerSrc)) {
    failures.push(`${REGISTER_PAGE_REL} — must export resolveRegisterAccountId (bank id → ledger_account_id)`);
  }
  if (!/ledger_account_id/.test(registerSrc)) {
    failures.push(`${REGISTER_PAGE_REL} — must resolve bank rows via ledger_account_id`);
  }
  if (!/Bank accounts/.test(registerSrc)) {
    failures.push(`${REGISTER_PAGE_REL} — picker must surface a "Bank accounts" optgroup bound to banking API rows`);
  }

  if (!/Go to bank register/.test(designViewSrc)) {
    failures.push(`${DESIGN_VIEW_REL} — missing "Go to bank register" action`);
  }
  if (!/\/accounting\/account-register\?accountId=/.test(designViewSrc)) {
    failures.push(
      `${DESIGN_VIEW_REL} — "Go to bank register" must target /accounting/account-register?accountId= (GL register deep link), not the Plaid feed`
    );
  }
  // Regression: must not be the feed-only path as the sole register target next to the label.
  const goRegisterBlock = designViewSrc.match(/Go to bank register[\s\S]{0,400}/);
  if (goRegisterBlock && /\/banking\/accounts\/\$\{/.test(goRegisterBlock[0]) && !/account-register\?accountId=/.test(goRegisterBlock[0])) {
    failures.push(`${DESIGN_VIEW_REL} — "Go to bank register" still points at /banking/accounts/:id feed`);
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function runReal() {
  const failures = assertGuard({
    registerSrc: readRepo(REGISTER_PAGE_REL),
    designViewSrc: readRepo(DESIGN_VIEW_REL),
  });
  if (failures.length > 0) {
    console.error("[verify-bank-register-account-picker] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    "[verify-bank-register-account-picker] OK — Account Register honors ?accountId= + banking accounts picker; DesignView Go to register is GL-bound"
  );
}

function runSelftest() {
  const goodRegister = `
    import { getAllAccounts } from "../../api/banking";
    export function resolveRegisterAccountId(requestedId, bankAccounts) {
      const bank = bankAccounts.find((a) => String(a.id) === requestedId);
      if (bank?.ledger_account_id) return String(bank.ledger_account_id);
      return requestedId ?? "";
    }
    const queryAccountId = searchParams.get("accountId");
    <optgroup label="Bank accounts">...</optgroup>
  `;
  const goodDesign = `
    <Link to={\`/accounting/account-register?accountId=\${encodeURIComponent(selectedAccount.id)}\`}>
      Go to bank register
    </Link>
  `;
  const cases = [
    {
      name: "healthy: picker + deep link + DesignView GL bind",
      input: { registerSrc: goodRegister, designViewSrc: goodDesign },
      expectPass: true,
    },
    {
      name: "regression: no getAllAccounts",
      input: {
        registerSrc: goodRegister.replace(/getAllAccounts/g, "listSomethingElse"),
        designViewSrc: goodDesign,
      },
      expectPass: false,
    },
    {
      name: "regression: no ?accountId= read",
      input: {
        registerSrc: goodRegister.replace(/searchParams\.get\(\s*["']accountId["']\s*\)/, 'searchParams.get("from_date")'),
        designViewSrc: goodDesign,
      },
      expectPass: false,
    },
    {
      name: "regression: DesignView still feeds /banking/accounts/:id",
      input: {
        registerSrc: goodRegister,
        designViewSrc: `
          <Link to={\`/banking/accounts/\${selectedAccount.id}\`}>
            Go to bank register
          </Link>
        `,
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
      console.error(
        `  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"} (${failures.join("; ")})`
      );
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("[verify-bank-register-account-picker] --selftest OK");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
