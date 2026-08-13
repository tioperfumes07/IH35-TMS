#!/usr/bin/env node
/**
 * @matrix-built {"modules":["banking"],"cols":["picker_law","connectivity","bank"],"leafRe":"^(transactions\\.(list|categorize)|accounts)$","task":"BANK-TXN-PICKER-LAW","vertical":"column-wave"}
 * verify-banking-register-categorize-capable.mjs  (Doc-18 KEYSTONE guard)
 *
 * Root cause it locks: clicking a bank account on Banking Home used to land the operator on a plain
 * read-only <table> (BankAccountDetail) — rows had no onClick, no categorize/post/match/split, no tab
 * strip, no From/To column, not resizable — a DIVERGENT second transaction surface next to the real
 * QBO-parity categorize grid (BankingTransactionsDesignView) on the Transactions tab.
 *
 * This guard asserts, so it can never regress:
 *   1. The /banking/accounts/:id route surface (BankAccountDetail.tsx) MOUNTS the categorize-capable
 *      register — it imports AND renders <BankingTransactionsDesignView>.
 *   2. The prior inert table is ARCHIVED (an `@archived` marker survives), never deleted (§7 additive).
 *   3. That register is genuinely categorize-capable: From/To column, resizable header, inline
 *      categorize/post, and a row → detail (match/categorize) drawer.
 *   4. Only ONE live categorize table exists across the banking pages — no divergent second grid.
 *   5. Picker law: categorize register keeps EntityPicker + inline "+ Add new …" for class/product.
 *
 * Self-test (pure logic against synthetic inputs): node scripts/verify-banking-register-categorize-capable.mjs --selftest
 * LINKAGE: banking register ↔ categorize grid (single surface). Additive only.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DETAIL_REL = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";
const DESIGN_VIEW_REL = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const BANKING_DIR_REL = "apps/frontend/src/pages/banking";

// A file hosts a LIVE categorize grid when its (non-archived) source both posts a categorization
// (categorizeBankTransaction) AND renders the QBO-parity From/To column.
// Phase B remapped columnKey="fromTo" → ParityColumn key: "fromTo" (same safety property).
function hostsLiveCategorizeGrid(src) {
  if (/@archived/.test(src)) return false;
  const hasFromTo = src.includes('columnKey="fromTo"') || /key:\s*"fromTo"/.test(src);
  return src.includes("categorizeBankTransaction(") && hasFromTo;
}

/**
 * Pure evaluation core (unit-testable / self-testable).
 * @param {{detailSrc:string, designViewSrc:string, bankingFiles:Array<{rel:string,src:string}>}} input
 * @returns {string[]} failures (empty => pass)
 */
export function evaluate({ detailSrc, designViewSrc, bankingFiles }) {
  const failures = [];

  // (1) Route surface mounts the categorize-capable register.
  if (!detailSrc.includes("BankingTransactionsDesignView")) {
    failures.push(`${DETAIL_REL} — does not import/reference BankingTransactionsDesignView (the categorize-capable register is not mounted)`);
  }
  if (!detailSrc.includes("<BankingTransactionsDesignView")) {
    failures.push(`${DETAIL_REL} — does not RENDER <BankingTransactionsDesignView …> (bank-account click must land on the register)`);
  }
  // The register must be pre-filtered to the clicked account.
  if (!/selectedAccountId=\{id\}/.test(detailSrc)) {
    failures.push(`${DETAIL_REL} — register is not pre-filtered to the route account (expected selectedAccountId={id})`);
  }

  // (2) The prior inert table is archived, not deleted.
  if (!detailSrc.includes("@archived")) {
    failures.push(`${DETAIL_REL} — the prior inert table must be ARCHIVED (missing @archived marker), never deleted (§7 additive)`);
  }

  // (3) The mounted register is genuinely categorize-capable.
  // Phase B: From/To is a ParityColumn key; resize is ParityTable enableColumnResize;
  // expansion is A1 controlled expandedKeys/onExpandedChange (expandedTxId still owns it).
  if (!/key:\s*"fromTo"/.test(designViewSrc) && !designViewSrc.includes('columnKey="fromTo"')) {
    failures.push(`${DESIGN_VIEW_REL} — register lost its From/To column (missing key: "fromTo")`);
  }
  if (!/enableColumnResize/.test(designViewSrc) && !designViewSrc.includes("onResize=")) {
    failures.push(
      `${DESIGN_VIEW_REL} — register lost its resizable header (missing enableColumnResize / onResize)`
    );
  }
  if (!designViewSrc.includes("categorizeBankTransaction(")) {
    failures.push(`${DESIGN_VIEW_REL} — register lost its inline categorize/post (missing 'categorizeBankTransaction(')`);
  }
  if (!designViewSrc.includes("expandedTxId")) {
    failures.push(
      `${DESIGN_VIEW_REL} — register lost its row → detail (match/categorize) drawer (missing 'expandedTxId')`
    );
  }

  // (3b) Picker law on the categorize register (Wave D / matrix picker_law).
  if (!designViewSrc.includes("EntityPicker")) {
    failures.push(`${DESIGN_VIEW_REL} — categorize register must keep EntityPicker (picker law)`);
  }
  if (!designViewSrc.includes('addNewLabel="+ Add new')) {
    failures.push(`${DESIGN_VIEW_REL} — categorize register must keep inline "+ Add new …" first-row create`);
  }

  // (4) Exactly ONE live categorize grid across the banking pages.
  const liveGrids = bankingFiles.filter((f) => hostsLiveCategorizeGrid(f.src)).map((f) => f.rel);
  if (liveGrids.length !== 1) {
    failures.push(
      `expected exactly ONE live categorize table across ${BANKING_DIR_REL}, found ${liveGrids.length}: [${liveGrids.join(", ")}] — do not keep two divergent live transaction tables`
    );
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function collectBankingFiles() {
  const root = path.join(process.cwd(), BANKING_DIR_REL);
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        out.push({ rel: path.relative(process.cwd(), full), src: fs.readFileSync(full, "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

function runReal() {
  const detailSrc = readRepo(DETAIL_REL);
  const designViewSrc = readRepo(DESIGN_VIEW_REL);
  const bankingFiles = collectBankingFiles();
  const failures = evaluate({ detailSrc, designViewSrc, bankingFiles });
  if (failures.length > 0) {
    console.error("[verify-banking-register-categorize-capable] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log("[verify-banking-register-categorize-capable] OK — bank-account click mounts the single categorize-capable register (From/To, resizable, categorize/post, row drawer); inert table archived");
}

function runSelftest() {
  const goodDesignView =
    'key: "fromTo" enableColumnResize categorizeBankTransaction( expandedTxId EntityPicker addNewLabel="+ Add new class"';
  const goodDetail =
    '<BankingTransactionsDesignView selectedAccountId={id} /> // @archived ArchivedBankAccountDetailTable';
  const cases = [
    {
      name: "healthy: register mounted, archived table, one live grid",
      input: {
        detailSrc: goodDetail,
        designViewSrc: goodDesignView,
        bankingFiles: [
          { rel: "components/BankingTransactionsDesignView.tsx", src: goodDesignView },
          { rel: "BankAccountDetail.tsx", src: goodDetail + " categorizeBankTransaction( // @archived" },
        ],
      },
      expectPass: true,
    },
    {
      name: "regression: detail no longer mounts the register",
      input: {
        detailSrc: '<table><tr>no onclick</tr></table> // @archived',
        designViewSrc: goodDesignView,
        bankingFiles: [{ rel: "components/BankingTransactionsDesignView.tsx", src: goodDesignView }],
      },
      expectPass: false,
    },
    {
      name: "regression: two live categorize grids (divergent surfaces)",
      input: {
        detailSrc: goodDetail,
        designViewSrc: goodDesignView,
        bankingFiles: [
          { rel: "components/BankingTransactionsDesignView.tsx", src: goodDesignView },
          { rel: "BankAccountDetail.tsx", src: 'categorizeBankTransaction( key: "fromTo"' },
        ],
      },
      expectPass: false,
    },
    {
      name: "regression: inert table deleted (no @archived marker)",
      input: {
        detailSrc: "<BankingTransactionsDesignView selectedAccountId={id} />",
        designViewSrc: goodDesignView,
        bankingFiles: [{ rel: "components/BankingTransactionsDesignView.tsx", src: goodDesignView }],
      },
      expectPass: false,
    },
    {
      name: "regression: picker law stripped from categorize register",
      input: {
        detailSrc: goodDetail,
        designViewSrc: 'key: "fromTo" enableColumnResize categorizeBankTransaction( expandedTxId',
        bankingFiles: [
          { rel: "components/BankingTransactionsDesignView.tsx", src: 'key: "fromTo" enableColumnResize categorizeBankTransaction( expandedTxId' },
          { rel: "BankAccountDetail.tsx", src: goodDetail + " categorizeBankTransaction( // @archived" },
        ],
      },
      expectPass: false,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = evaluate(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"} (${failures.join("; ")})`);
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("[verify-banking-register-categorize-capable] --selftest OK");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
