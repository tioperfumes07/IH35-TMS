#!/usr/bin/env node
// ROUND 443.267 / 443.280 board 3 — Banking Home against docs/design/v3/Banking:
//   Home = BankingHomeBoard: KPI strip (Money in/out · Lines to review · Drift) →
//   Accounts | Reconciliation drift (lg:grid-cols-2) → Latest lines.
//   443.280 PARTIAL close: feed status dots, Drift KPI red when open, Latest Date MM-DD,
//   Latest Amount signed without $, institution middot on account labels.
//   FactoringSummaryCard + DriverEscrowSummaryCard stay mounted on Banking (Accounts tab)
//   for Rule 07 / liability-built — not a Home reskin of those cards.
//   MTD lines still come from getFactoringKpis / getBankingLedgerKpis (one engine each).
//   No live link targets /banking/factoring — ROUND-20.8 B3 (#21962) redirect dead end.
// Static (no DATABASE_URL). --selftest plants each regression.
export const ALLOW_OFFLINE_SKIP = "static source contract — no Neon required";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-banking-home-preview-parity";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const CARD = "apps/frontend/src/pages/banking/components/FactoringSummaryCard.tsx";
const ESCROW = "apps/frontend/src/pages/banking/components/DriverEscrowSummaryCard.tsx";
const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const BOARD = "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx";
// The redirect routes themselves are allowed to name the retired path.
const ROUTE_FILES = new Set(["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/router/route-manifest.ts"]);

/** Board Latest Amount formatter: return isCredit ? `+${body}` : `−${body}`; (no $ glyph). */
const BOARD_SIGNED_NO_DOLLAR = "return isCredit ? `" + "+${body}` : `" + "−${body}`;";
/** Regressed form that paints a $ glyph via template escape: +$${body} / −$${body}. */
const BOARD_SIGNED_WITH_DOLLAR = "return isCredit ? `" + "+$${body}` : `" + "−$${body}`;";

export function check({ card, escrow, home, board, files }) {
  const f = [];
  if (!board) f.push(`${BOARD}: missing — 443.267 board-faithful Banking Home`);
  else {
    if (!/data-testid="banking-home-board"/.test(board)) f.push(`${BOARD}: board root test id missing`);
    if (!/Money in ·/.test(board) || !/Money out ·/.test(board)) f.push(`${BOARD}: KPI strip must label Money in / Money out`);
    if (!/Lines to review/.test(board)) f.push(`${BOARD}: KPI strip must include Lines to review`);
    if (!/Reconciliation drift/.test(board)) f.push(`${BOARD}: must render Reconciliation drift section`);
    if (!/Latest lines/.test(board)) f.push(`${BOARD}: must render Latest lines section`);
    if (!/getMoneyMap\(/.test(board)) f.push(`${BOARD}: Money in/out must come from getMoneyMap`);
    if (!/getDriftAlerts\(/.test(board)) f.push(`${BOARD}: drift table must come from getDriftAlerts`);
    if (!/Nothing is matched automatically/.test(board)) {
      f.push(`${BOARD}: Latest lines footer must say nothing is matched automatically`);
    }
    // 443.280 — board grammar close (was REBUILT/PARTIAL: stacked panels + missing feed dots / date / tone).
    if (!/data-testid="banking-home-board-accounts-drift"/.test(board)) {
      f.push(`${BOARD}: Accounts|Drift must share banking-home-board-accounts-drift grid`);
    }
    if (!/lg:grid-cols-2/.test(board) || !/banking-home-board-accounts-drift/.test(board)) {
      f.push(`${BOARD}: Accounts|Drift must be lg:grid-cols-2 (board 1fr 1fr)`);
    }
    if (!/function FeedCell/.test(board) || !/#15803D/.test(board) || !/#94A3B8/.test(board)) {
      f.push(`${BOARD}: Feed column must render green/gray status dots (board Feed / No feed)`);
    }
    if (!/tone=\{driftCount > 0 \? "red" : "ink"\}/.test(board)) {
      f.push(`${BOARD}: Drift alerts KPI must tone red when open (board #B91C1C)`);
    }
    if (!/function formatBoardMmDd/.test(board) || !/formatBoardMmDd\(tx\.transaction_date\)/.test(board)) {
      f.push(`${BOARD}: Latest lines Date must use board MM-DD (formatBoardMmDd)`);
    }
    if (!board.includes(BOARD_SIGNED_NO_DOLLAR) || board.includes(BOARD_SIGNED_WITH_DOLLAR)) {
      f.push(`${BOARD}: Latest Amount must format as +/− body without $ (board −150.00)`);
    }
    if (!board.includes("· ${inst}") && !board.includes("` · ${inst}`") && !/\$\{base\} · \$\{inst\}/.test(board)) {
      f.push(`${BOARD}: account labels must append institution with middot when known`);
    }
    if (/<V3Panel\b/.test(board)) f.push(`${BOARD}: must not layer V3Panel (443.280 BoardSection only)`);
    if (!/<BoardSection\b/.test(board)) f.push(`${BOARD}: must wrap panels in BoardSection`);
    if (!/<V3KpiTile\b/.test(board)) f.push(`${BOARD}: must mount V3KpiTile KPI strip`);
  }
  if (!/<BankingHomeBoard/.test(home)) f.push(`${HOME}: must mount BankingHomeBoard on the Home (accounts) tab`);
  // Rendered text only (between > and <), so a comment that quotes the old placeholder cannot trip it.
  if (/>\s*—\s*\(see [^<]*</.test(card)) f.push(`${CARD}: a "— (see …)" placeholder is back — show the engine value or its empty_reason`);
  if (!/kpi=\{mtd\?\.purchased/.test(card) || !/kpi=\{mtd\?\.defaultInterest/.test(card)) f.push(`${CARD}: the MTD lines must render the factoring KPI engine rows`);
  if (!/getFactoringKpis\(companyId, monthToDate\.from, monthToDate\.to\)/.test(home)) f.push(`${HOME}: the factoring card's MTD lines must come from getFactoringKpis (one engine)`);
  if (!escrow) f.push(`${ESCROW}: missing — Driver Escrow panel (Accounts tab)`);
  else if (!/data-testid="banking-driver-escrow-summary-card"/.test(escrow)) f.push(`${ESCROW}: escrow card test id missing`);
  if (!/<DriverEscrowSummaryCard/.test(home)) f.push(`${HOME}: the Driver Escrow card is not mounted on Banking`);
  if (!/<FactoringSummaryCard/.test(home)) f.push(`${HOME}: FactoringSummaryCard must stay mounted (Accounts tab / Rule 07)`);
  if (!/getBankingLedgerKpis\(companyId, monthToDate\.from, monthToDate\.to\)/.test(home)) f.push(`${HOME}: the escrow card must be fed by the banking KPI engine`);
  for (const [rel, src] of files) {
    if (ROUTE_FILES.has(rel)) continue;
    if (/(?:to|href)=\{?["'`]\/banking\/factoring(?:[?"'`])/.test(src) || /return "\/banking\/factoring"/.test(src)) {
      f.push(`${rel}: links to the retired /banking/factoring (a redirect back to /banking — a dead end)`);
    }
  }
  return f;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "__tests__"].includes(e.name)) walk(p, acc); }
    else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null);
const real = () => ({
  card: read(CARD), escrow: read(ESCROW), home: read(HOME), board: read(BOARD),
  files: walk(SRC).map((p) => [path.relative(ROOT, p), fs.readFileSync(p, "utf8")]),
});

if (process.argv.includes("--selftest")) {
  const r = real();
  if (check(r).length) { console.error(`${LABEL} --selftest FAIL: tree not clean:\n  ${check(r).join("\n  ")}`); process.exit(1); }
  const plants = [
    ["placeholder back", { ...r, card: r.card + "\n<dd className=\"x\">\n  — (see Factoring module)\n</dd>\n" }],
    ["escrow card unmounted", { ...r, home: r.home.replace("<DriverEscrowSummaryCard", "<Unused") }],
    ["board unmounted", { ...r, home: r.home.replace("<BankingHomeBoard", "<Unused") }],
    ["board drops money-map", { ...r, board: r.board.replace(/getMoneyMap\(/g, "getBankingKpis(") }],
    ["MTD off the engine", { ...r, home: r.home.replace("getFactoringKpis(companyId, monthToDate.from, monthToDate.to)", "Promise.resolve(null)") }],
    ["dead link back", { ...r, files: [...r.files, ["apps/frontend/src/pages/x.tsx", '<Link to="/banking/factoring">x</Link>']] }],
    ["accounts-drift unsplit", { ...r, board: r.board.replace(/lg:grid-cols-2/g, "lg:grid-cols-1") }],
    ["drift tone not red", { ...r, board: r.board.replace('tone={driftCount > 0 ? "red" : "ink"}', 'tone={driftCount > 0 ? "amber" : "ink"}') }],
    ["latest date not MM-DD", { ...r, board: r.board.replace(/formatBoardMmDd\(tx\.transaction_date\)/g, "formatMmDdYyyy(tx.transaction_date)") }],
    // Replacement strings treat $ specially ($$ → $) — use a function replacer.
    ["latest amount regains $", { ...r, board: r.board.replace(
      /return isCredit \? `\+\$\{body\}` : `−\$\{body\}`;/,
      () => BOARD_SIGNED_WITH_DOLLAR,
    ) }],
    ["feed dots removed", { ...r, board: r.board.replace(/#15803D/g, "#111111").replace(/function FeedCell/g, "function FeedText") }],
  ];
  const missed = plants.filter(([, s]) => check(s).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}
const fails = check(real());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — board-faithful BankingHomeBoard (Accounts|Drift 1fr1fr + feed dots + MM-DD) + factoring/escrow on Accounts tab`);
