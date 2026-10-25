#!/usr/bin/env node
/**
 * ROUND 443.282 — Settlements Escrow home + Escrow Register board rebuild (non-financial).
 * Board replaces layout; engines listEscrowAccounts / getEscrowDriverBalances+Timeline stay.
 */
import fs from "node:fs";
import path from "node:path";

const BOARD = "apps/frontend/src/pages/driver-finance/SettlementsEscrowBoard.tsx";
const MOUNTED = "apps/frontend/src/pages/driver-finance/SettlementsMountedPages.tsx";
const REGISTER = "apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx";

export function runEscrowBoardRebuildChecks(root = process.cwd()) {
  const failures = [];
  const read = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`${rel}: missing`);
      return "";
    }
    return fs.readFileSync(abs, "utf8");
  };

  const mounted = read(MOUNTED);
  if (
    /from\s+["'][^"']*EscrowPage["']/.test(mounted) ||
    /<EscrowPage\b/.test(mounted) ||
    /\bsettlementsMount\b/.test(mounted.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))
  ) {
    failures.push(`${MOUNTED}: must not mount EscrowPage / settlementsMount under Settlements chrome`);
  }
  if (!mounted.includes("SettlementsEscrowBoard")) {
    failures.push(`${MOUNTED}: SettlementsEscrowPage must mount SettlementsEscrowBoard`);
  }

  const board = read(BOARD);
  if (!board.includes('data-settlements-escrow-rebuild="1"')) {
    failures.push(`${BOARD}: must mark data-settlements-escrow-rebuild="1"`);
  }
  if (!board.includes("listEscrowAccounts")) {
    failures.push(`${BOARD}: must use listEscrowAccounts (engine unchanged)`);
  }
  if (!board.includes("settlementsEscrowRegisterHref")) {
    failures.push(`${BOARD}: driver links must use settlementsEscrowRegisterHref`);
  }
  if (board.includes("headerActions") || board.includes("footerRow")) {
    failures.push(`${BOARD}: must use ParityTable toolbar + footerCells (not headerActions/footerRow)`);
  }
  // 443.280 FULL — shared BoardSection around the by-driver table (docs/design/v3/Settlements-Escrow).
  if (!/from ["'].*components\/v3\/BoardSection["']/.test(board) || !/<BoardSection\b/.test(board)) {
    failures.push(`${BOARD}: must wrap ParityTable in shared BoardSection`);
  }
  if (/\bV3Panel\b/.test(board)) {
    failures.push(`${BOARD}: must not remount V3Panel`);
  }
  if (!/Open register →/.test(board)) {
    failures.push(`${BOARD}: must keep Open register → action (board)`);
  }

  const register = read(REGISTER);
  if (!register.includes('data-settlements-escrow-register-rebuild="1"')) {
    failures.push(`${REGISTER}: must mark data-settlements-escrow-register-rebuild="1"`);
  }
  if (!register.includes("data-testid=\"escrow-register-release\"")) {
    failures.push(`${REGISTER}: board toolbar must include Release escrow (data-testid)`);
  }
  if (!register.includes("/accounting/escrow?holder_id=")) {
    failures.push(`${REGISTER}: Release escrow must deep-link Accounting Escrow for holder`);
  }
  if (!/from ["'].*components\/v3\/BoardSection["']/.test(register) || !/<BoardSection\b/.test(register)) {
    failures.push(`${REGISTER}: must wrap ParityTable in shared BoardSection`);
  }
  if (/\bV3Panel\b/.test(register)) {
    failures.push(`${REGISTER}: must not remount V3Panel`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-settlements-escrow-board-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  mk(
    MOUNTED,
    `import { SettlementsEscrowBoard } from "./SettlementsEscrowBoard";\n` +
      `export function SettlementsEscrowPage() { return <SettlementsEscrowBoard />; }\n`,
  );
  mk(
    BOARD,
    `import { BoardSection } from "../../components/v3/BoardSection";\n` +
      `data-settlements-escrow-rebuild="1"\nlistEscrowAccounts\nsettlementsEscrowRegisterHref\n` +
      `toolbar\nfooterCells\n<BoardSection\nOpen register →\n`,
  );
  mk(
    REGISTER,
    `import { BoardSection } from "../../components/v3/BoardSection";\n` +
      `data-settlements-escrow-register-rebuild="1"\n` +
      `data-testid="escrow-register-release"\n/accounting/escrow?holder_id=\n<BoardSection\n`,
  );
  if (runEscrowBoardRebuildChecks(tmp).length) {
    throw new Error("PASS fail: " + runEscrowBoardRebuildChecks(tmp).join("; "));
  }
  mk(MOUNTED, `import { EscrowPage } from "../accounting/EscrowPage";\nsettlementsMount\n`);
  if (!runEscrowBoardRebuildChecks(tmp).length) {
    throw new Error("FAIL fail: EscrowPage mount not detected");
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-settlements-escrow-board-rebuild --selftest OK");
} else {
  const f = runEscrowBoardRebuildChecks();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-settlements-escrow-board-rebuild — OK");
}
