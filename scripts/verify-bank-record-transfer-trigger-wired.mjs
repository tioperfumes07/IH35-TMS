#!/usr/bin/env node
/**
 * BANK-F02 / BANK-SURF-03 — Record Transfer trigger must be reachable from Banking Home
 * (default /banking = accounts tab) and from Transfers list. Modal+API alone is ORPHAN_NEW.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-record-transfer-trigger-wired";

const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const TRANSFERS = "apps/frontend/src/pages/banking/TransfersListPage.tsx";

/** @param {{ home: string | null, transfers: string | null }} input */
export function check({ home, transfers }) {
  const f = [];
  if (!home) f.push(`${HOME}: missing`);
  else {
    if (!/data-testid=["']banking-home-record-transfer["']/.test(home)) {
      f.push(`${HOME}: must expose data-testid=banking-home-record-transfer`);
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
  return check({ home: read(HOME), transfers: read(TRANSFERS) });
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
  });
  if (ok.length) throw new Error(`${LABEL} PASS fail: ${ok.join("; ")}`);
  const bad = check({
    home: `const navActions = (<></>); const tabActions = activeTab === "transactions" ? (<ActionButton onClick={() => setTransferModalOpen(true)}>+ Record Transfer</ActionButton>) : null;`,
    transfers: `<Link to="/banking">Banking Home — Record Transfer</Link>`,
  });
  if (!bad.length) throw new Error(`${LABEL} FAIL fail: expected failures`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
