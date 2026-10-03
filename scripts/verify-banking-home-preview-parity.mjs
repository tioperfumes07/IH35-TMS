#!/usr/bin/env node
// ROUND 335 item 2 — Banking home against the approved preview (docs/approved-screens/4-Banking_Homepage.png):
//   Feature 1, the factoring virtual bank: its month-to-date lines come from the factoring KPI engine (ledger-tied), never
//   a "— (see …)" placeholder (ROUND 326.2: "No placeholder panels. A KPI with no data says so and says why.").
//   Feature 2, the driver escrow visualizer: mounted on Banking home, fed by the banking KPI engine's escrow KPIs.
//   No live link targets /banking/factoring — ROUND-20.8 B3 (#21962) turned it into a redirect back to /banking, so a link
//   to it is a dead end (the routes themselves stay, so old bookmarks resolve).
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
// The redirect routes themselves are allowed to name the retired path.
const ROUTE_FILES = new Set(["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/router/route-manifest.ts"]);

export function check({ card, escrow, home, files }) {
  const f = [];
  // Rendered text only (between > and <), so a comment that quotes the old placeholder cannot trip it.
  if (/>\s*—\s*\(see [^<]*</.test(card)) f.push(`${CARD}: a "— (see …)" placeholder is back — show the engine value or its empty_reason`);
  if (!/kpi=\{mtd\?\.purchased/.test(card) || !/kpi=\{mtd\?\.defaultInterest/.test(card)) f.push(`${CARD}: the MTD lines must render the factoring KPI engine rows`);
  if (!/getFactoringKpis\(companyId, monthToDate\.from, monthToDate\.to\)/.test(home)) f.push(`${HOME}: the factoring card's MTD lines must come from getFactoringKpis (one engine)`);
  if (!escrow) f.push(`${ESCROW}: missing — the preview's Driver Escrow panel`);
  else if (!/data-testid="banking-driver-escrow-summary-card"/.test(escrow)) f.push(`${ESCROW}: escrow card test id missing`);
  if (!/<DriverEscrowSummaryCard/.test(home)) f.push(`${HOME}: the Driver Escrow card is not mounted on Banking home`);
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
  card: read(CARD), escrow: read(ESCROW), home: read(HOME),
  files: walk(SRC).map((p) => [path.relative(ROOT, p), fs.readFileSync(p, "utf8")]),
});

if (process.argv.includes("--selftest")) {
  const r = real();
  if (check(r).length) { console.error(`${LABEL} --selftest FAIL: tree not clean:\n  ${check(r).join("\n  ")}`); process.exit(1); }
  const plants = [
    ["placeholder back", { ...r, card: r.card + "\n<dd className=\"x\">\n  — (see Factoring module)\n</dd>\n" }],
    ["escrow card unmounted", { ...r, home: r.home.replace("<DriverEscrowSummaryCard", "<Unused") }],
    ["MTD off the engine", { ...r, home: r.home.replace("getFactoringKpis(companyId, monthToDate.from, monthToDate.to)", "Promise.resolve(null)") }],
    ["dead link back", { ...r, files: [...r.files, ["apps/frontend/src/pages/x.tsx", '<Link to="/banking/factoring">x</Link>']] }],
  ];
  const missed = plants.filter(([, s]) => check(s).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}
const fails = check(real());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — factoring card on the KPI engine (no placeholders), driver escrow card mounted on the banking engine, no live link to /banking/factoring`);
