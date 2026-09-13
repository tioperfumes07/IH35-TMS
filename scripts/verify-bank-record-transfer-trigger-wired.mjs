#!/usr/bin/env node
/**
 * BANK-F02 / BANK-SURF-03 — Record Transfer trigger must be reachable from Banking Home
 * (default /banking = accounts tab) and from Transfers list. Modal+API alone is ORPHAN_NEW.
 *
 * ACCT-F26301-B (2026-09-13) — ROUND-20.8 B1/B2 (#21946) folded the standalone "+ Record Transfer"
 * button on Banking Home into the shared "+ New" grouped dropdown (BankingNewMenu.tsx), so the
 * `data-testid` this guard originally required no longer appears as a literal JSX attribute in
 * BankingHome.tsx itself — it is rendered by the child menu component instead. That is a legitimate
 * design change (an approved header consolidation, not a regression), so this guard now accepts
 * EITHER shape: the original inline `data-testid="banking-home-record-transfer"` button, OR a
 * BankingNewMenu item carrying `testId: "banking-home-record-transfer"` — checked against
 * BankingNewMenu.tsx too, to prove that field is actually forwarded to a real DOM attribute and not
 * a dead field.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-record-transfer-trigger-wired";

const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const TRANSFERS = "apps/frontend/src/pages/banking/TransfersListPage.tsx";
const NEW_MENU = "apps/frontend/src/pages/banking/components/BankingNewMenu.tsx";

const TESTID_LITERAL = /data-testid=["']banking-home-record-transfer["']/;
const TESTID_MENU_ITEM = /testId:\s*["']banking-home-record-transfer["']/;
/** BankingNewMenu.tsx must actually forward `item.testId` to a real DOM data-testid attribute —
 * otherwise a `testId:` field in BankingHome.tsx would be a dead label satisfying only this regex. */
const MENU_FORWARDS_TESTID = /data-testid=\{item\.testId\s*\?\?/;

/** @param {{ home: string | null, transfers: string | null, newMenu: string | null }} input */
export function check({ home, transfers, newMenu }) {
  const f = [];
  if (!home) f.push(`${HOME}: missing`);
  else {
    const hasInlineTestId = TESTID_LITERAL.test(home);
    const hasMenuItemTestId = TESTID_MENU_ITEM.test(home) && Boolean(newMenu) && MENU_FORWARDS_TESTID.test(newMenu);
    if (!hasInlineTestId && !hasMenuItemTestId) {
      f.push(
        `${HOME}: must expose data-testid=banking-home-record-transfer, either inline or as a ` +
          `BankingNewMenu item testId (with ${NEW_MENU} actually forwarding item.testId to a real ` +
          "data-testid attribute)"
      );
    }
    if (!/\+ Record Transfer/.test(home) || !/setTransferModalOpen\(true\)/.test(home)) {
      f.push(`${HOME}: must open TransferModal via + Record Transfer`);
    }
    // Must NOT bury the only trigger under activeTab === "transactions"
    const navBlock = home.match(/const navActions[\s\S]*?;\s*\n\s*const tabActions/);
    if (!navBlock || !/banking-home-record-transfer/.test(navBlock[0])) {
      f.push(`${HOME}: + Record Transfer must live in navActions (every Banking tab), not only Transactions`);
    }
  }
  if (!transfers) f.push(`${TRANSFERS}: missing`);
  else {
    if (!/data-testid=["']transfers-page-record-transfer["']/.test(transfers)) {
      f.push(`${TRANSFERS}: must expose data-testid=transfers-page-record-transfer`);
    }
    if (!/import \{ TransferModal \}/.test(transfers) && !/from ["']\.\/TransferModal["']/.test(transfers)) {
      f.push(`${TRANSFERS}: must import TransferModal`);
    }
    if (!/<TransferModal[\s\S]*open=\{transferModalOpen\}/.test(transfers)) {
      f.push(`${TRANSFERS}: must render TransferModal bound to transferModalOpen`);
    }
    if (/Banking Home — Record Transfer/.test(transfers) && !/setTransferModalOpen\(true\)/.test(transfers)) {
      f.push(`${TRANSFERS}: must not send operators to /banking without a local + Record Transfer opener`);
    }
  }
  return f;
}

export function run(root = ROOT) {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({ home: read(HOME), transfers: read(TRANSFERS), newMenu: read(NEW_MENU) });
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bank-record-transfer-trigger-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    HOME,
    `const navActions = (
    <>
      <ActionButton data-testid="banking-home-record-transfer" onClick={() => setTransferModalOpen(true)}>+ Record Transfer</ActionButton>
    </>
  );
  const tabActions = null;`,
  );
  mk(
    TRANSFERS,
    `import { TransferModal } from "./TransferModal";
    <ActionButton data-testid="transfers-page-record-transfer" onClick={() => setTransferModalOpen(true)}>+ Record Transfer</ActionButton>
    <TransferModal open={transferModalOpen} operatingCompanyId={companyId} onClose={() => {}} onSaved={() => {}} />`,
  );
  const ok = check({
    home: fs.readFileSync(path.join(tmp, HOME), "utf8"),
    transfers: fs.readFileSync(path.join(tmp, TRANSFERS), "utf8"),
    newMenu: null,
  });
  if (ok.length) throw new Error(`${LABEL} PASS fail: ${ok.join("; ")}`);
  const bad = check({
    home: `const navActions = (<></>); const tabActions = activeTab === "transactions" ? (<ActionButton onClick={() => setTransferModalOpen(true)}>+ Record Transfer</ActionButton>) : null;`,
    transfers: `<Link to="/banking">Banking Home — Record Transfer</Link>`,
    newMenu: null,
  });
  if (!bad.length) throw new Error(`${LABEL} FAIL fail: expected failures`);

  // ACCT-F26301-B — the CURRENT real shape (BankingNewMenu dropdown item with testId) must PASS
  // when the menu component genuinely forwards item.testId to a real DOM attribute...
  const menuHome = `const navActions = (
    <BankingNewMenu groups={[{ heading: "Record", items: [
      { key: "record-transfer", label: "+ Record Transfer", onClick: () => setTransferModalOpen(true), testId: "banking-home-record-transfer" },
    ] }]} />
  );
  const tabActions = null;`;
  const menuForwards = `data-testid={item.testId ?? \`banking-new-menu-item-\${item.key}\`}`;
  const menuOk = check({ home: menuHome, transfers: fs.readFileSync(path.join(tmp, TRANSFERS), "utf8"), newMenu: menuForwards });
  if (menuOk.length) throw new Error(`${LABEL} menu-item-shape PASS fail: ${menuOk.join("; ")}`);

  // ...but must FAIL when the menu component does NOT actually forward testId to a real DOM
  // attribute (a dead `testId:` field in BankingHome.tsx would otherwise satisfy the guard while
  // the DOM never carries the selector).
  const menuDeadField = check({
    home: menuHome,
    transfers: fs.readFileSync(path.join(tmp, TRANSFERS), "utf8"),
    newMenu: `data-testid={\`banking-new-menu-item-\${item.key}\`}`,
  });
  if (!menuDeadField.length) throw new Error(`${LABEL} dead-testid-field fail: expected failure when BankingNewMenu does not forward item.testId`);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${LABEL} --selftest OK (inline shape, dropdown-menu shape, and dead-field regression all correctly classified)`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
