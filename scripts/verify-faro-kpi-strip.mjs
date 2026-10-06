#!/usr/bin/env node
// ROUND 435-CC2 (Lead) — FARO TABS + KPI STRIP. Owner, on the Factoring KPIs: "the messages should not be there."
//
// What the order locks, and what this guard fails on:
//   1. TEN TABS. Every factoring tab label (route-manifest FARO_TABS) is one of the owner's ten, verbatim, and there are
//      exactly ten. No eleventh tab.
//   2. NO KPI TWICE. The Factoring screen is one screen: the page-level strips (home KPI row, the ledger KPI engine strip,
//      the cash-flow strip) render on every tab, and the section strips render under them. Across all of them:
//        a. no two tiles carry the same name (normalized label);
//        b. no two client tiles read the same value expression;
//        c. no client tile re-renders a balance the ledger KPI engine strip already renders (escrow / cash reserve
//           balance) — the engine strip owns those.
//   3. NAME AND NUMBER ONLY. No `hint=` on a Factoring tile; the shared ledger tile (LedgerKpiPanel) prints no
//      empty-reason / row-count / comparison sentence inside the tile — those ride on its hover title only.
//   4. ONE TILE SIZE. Every Factoring DrillKpiCard is size="md", and LedgerKpiPanel draws its tile from DrillKpiCard's
//      exported kpiTileClasses("md") — the same shell, not a look-alike.
//
// Usage: node scripts/verify-faro-kpi-strip.mjs [--selftest] [--count]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-faro-kpi-strip";

export const FILES = {
  manifest: "apps/frontend/src/router/route-manifest.ts",
  home: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
  cashFlow: "apps/frontend/src/pages/factoring/FactoringCashFlowPanel.tsx",
  reserves: "apps/frontend/src/components/factoring/FactoringReservesSharedPanel.tsx",
  ledgerPanel: "apps/frontend/src/components/shared/LedgerKpiPanel.tsx",
  server: "apps/backend/src/factoring/factoring-kpi.service.ts",
};

/** The owner's ten, verbatim (ROUND 435). */
export const OWNER_TEN = [
  "Submit invoice",
  "Debtor receipts",
  "Account summary",
  "Aging",
  "Chargeback and overpayments",
  "Unapplied cash",
  "Payments to us",
  "Purchase report",
  "Fees paid",
  "Reserve",
];

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s) => String(s).replace(/\s+/g, "");

/** Every `<DrillKpiCard ... />` in a source: { label, value, size, hint, host, raw }. */
export function drillCards(src) {
  const out = [];
  for (const m of String(src).matchAll(/<DrillKpiCard\b([\s\S]*?)\/>/g)) {
    const raw = m[1];
    const label = raw.match(/\blabel=(?:"([^"]*)"|\{([\s\S]*?)\}\s*\n)/);
    const value = raw.match(/\bvalue=\{([\s\S]*?)\}\s*\n/);
    out.push({
      label: label ? (label[1] ?? label[2]) : null,
      value: value ? squash(value[1]) : null,
      size: raw.match(/\bsize="(\w+)"/)?.[1] ?? null,
      hint: /\bhint=/.test(raw),
      raw,
    });
  }
  return out;
}

/** The labels the ledger KPI engine emits (literal `label: "…"` and the [key, label] tuples, both branches of a ternary). */
export function serverLabels(src) {
  const labels = [];
  for (const m of String(src).matchAll(/out\.push\(\{\s*key:\s*"(\w+)",\s*label:\s*"([^"]+)"/g)) labels.push({ key: m[1], label: m[2] });
  for (const m of String(src).matchAll(/\[\s*"(\w+)",\s*(?:[\w.]+\s*\?\s*"([^"]+)"\s*:\s*)?"([^"]+)",\s*acc\.\w+\s*\]/g)) {
    labels.push({ key: m[1], label: m[3] });
    if (m[2]) labels.push({ key: m[1], label: m[2], alt: true });
  }
  return labels;
}

/** The FARO_TABS labels in the manifest. */
export function manifestTabLabels(src) {
  const block = String(src).match(/export const FARO_TABS\b[\s\S]*?\n\];?/);
  if (!block) return null;
  return [...block[0].matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** The reserves panel tiles that render on the FACTORING host (a `host === "banking"` block is Banking-only). */
export function reservesFactoringHostCards(src) {
  const bankingOnly = String(src).match(/\{host === "banking" \? \(([\s\S]*?)\) : null\}/);
  const factoringSrc = bankingOnly ? String(src).replace(bankingOnly[0], "") : String(src);
  return drillCards(factoringSrc);
}

// engineReserve (FactoringHome) and engine (FactoringReservesSharedPanel) are the client copies of the engine's escrow / cash
// balances; a tile reading either re-renders an engine tile.
const SERVER_OWNED_VALUE = /engineHeld\(|\b(?:engineReserve|engine)\??\.(escrow|cash)\b|\b(?:engineReserve|engine)\[["'](escrow|cash)["']\]/;

export function analyze(files) {
  const problems = [];

  // 1. ten tabs
  const tabs = manifestTabLabels(files.manifest);
  if (!tabs) problems.push(`${FILES.manifest}: FARO_TABS not found`);
  else {
    if (tabs.length !== OWNER_TEN.length) problems.push(`FARO_TABS has ${tabs.length} tabs — the owner's list is exactly ${OWNER_TEN.length}`);
    for (const t of tabs) if (!OWNER_TEN.includes(t)) problems.push(`factoring tab "${t}" is not one of the owner's ten`);
  }

  // 2 + 3 + 4. tiles on the one Factoring screen
  const client = [
    ...drillCards(files.home).map((c) => ({ ...c, file: FILES.home })),
    ...drillCards(files.cashFlow).map((c) => ({ ...c, file: FILES.cashFlow })),
    ...reservesFactoringHostCards(files.reserves).map((c) => ({ ...c, file: FILES.reserves })),
  ];
  const server = serverLabels(files.server);
  if (server.length < 5) problems.push(`${FILES.server}: found only ${server.length} engine KPI labels — parser drifted`);

  const seenKey = new Map();
  for (const s of server.filter((x) => !x.alt)) {
    if (seenKey.has(s.key)) problems.push(`engine KPI key "${s.key}" emitted twice`);
    seenKey.set(s.key, s.label);
  }

  const seenLabel = new Map();
  const claim = (label, where) => {
    if (label == null) return;
    const k = norm(label.replace(/^[^"]*\?\s*"|"\s*:.*$/g, ""));
    if (!k) return;
    if (seenLabel.has(k)) problems.push(`KPI "${label}" renders twice on the Factoring screen (${seenLabel.get(k)} and ${where})`);
    else seenLabel.set(k, where);
  };
  for (const s of server.filter((x) => !x.alt)) claim(s.label, `engine:${s.key}`);
  const seenValue = new Map();
  for (const c of client) {
    const where = `${path.basename(c.file)}:${c.label}`;
    claim(c.label?.includes('"') ? (c.label.match(/"([^"]+)"/)?.[1] ?? c.label) : c.label, where);
    if (c.value) {
      if (seenValue.has(c.value)) problems.push(`two tiles read the same value ${c.value} (${seenValue.get(c.value)} and ${where})`);
      else seenValue.set(c.value, where);
      if (SERVER_OWNED_VALUE.test(c.value)) problems.push(`${where}: re-renders a reserve balance the ledger KPI engine strip already shows`);
    }
    if (c.hint) problems.push(`${where}: hint= puts a sentence inside a tile — a tile is a name and a number`);
    if (c.size !== "md") problems.push(`${where}: size="${c.size ?? "(default sm)"}" — one tile size on the Factoring screen is size="md"`);
  }

  const lp = String(files.ledgerPanel);
  if (!/kpiTileClasses\("md"\)/.test(lp)) problems.push(`${FILES.ledgerPanel}: must draw its tile from kpiTileClasses("md")`);
  for (const [i, line] of lp.split("\n").entries()) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("title=") || t.startsWith("{/*") || t.startsWith("*")) continue;
    if (/\{k\.empty_reason\b|\$\{k\.row_count\}|\{k\.compare_label\}\s*\{fmtCompare/.test(line)) {
      problems.push(`${FILES.ledgerPanel}:${i + 1}: a sentence (empty reason / row count / comparison) rendered inside the tile`);
    }
  }

  return { problems, tiles: { client: client.length, server: server.filter((x) => !x.alt).length } };
}

function readAll(root) {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) out[k] = fs.readFileSync(path.join(root, rel), "utf8");
  return out;
}

function selftest() {
  const base = readAll(ROOT);
  const clean = analyze(base);
  if (clean.problems.length) {
    console.error(`${LABEL} --selftest: the tree itself fails:\n  ${clean.problems.join("\n  ")}`);
    process.exit(1);
  }
  const mut = (field, fn) => ({ ...base, [field]: fn(base[field]) });
  const cases = [
    ["an eleventh tab", mut("manifest", (s) => s.replace(/(export const FARO_TABS\b[\s\S]*?)(\n\];?)/, '$1\n  { id: "extra", label: "Extra" },$2'))],
    ["a renamed tab", mut("manifest", (s) => s.replace('label: "Reserve"', 'label: "Reserves"'))],
    ["a duplicate label", mut("cashFlow", (s) => s.replace('label="Posted wires"', 'label="Net cash received"'))],
    ["a duplicate value", mut("home", (s) => s.replace(/(testId="factoring-kpi-advanced-mtd"[\s\S]*?value=\{)[^\n]*\}/, "$1summaryQuery.isError ? null : fmtCurrency(summary?.outstanding_liability_balance)}"))],
    ["a client reserve balance tile", mut("home", (s) => s.replace("</div>\n          {/* ROUND 435 — the cleared", '  <DrillKpiCard\n              size="md"\n              testId="x"\n              label="Held"\n              value={engineReserve?.escrow}\n              to="/x"\n            />\n          </div>\n          {/* ROUND 435 — the cleared'))],
    ["a hint", mut("home", (s) => s.replace('label="Advanced MTD"', 'label="Advanced MTD"\n              hint="12 advances"'))],
    ["a second tile size", mut("cashFlow", (s) => s.replace('size="md"', 'size="sm"'))],
    ["a sentence in the ledger tile", mut("ledgerPanel", (s) => s.replace(/(<div className=\{TILE\.label\}>\{k\.primary_label \?\? k\.label\}<\/div>)/, '$1\n            <div>{k.empty_reason ?? ""}</div>'))],
    ["escrow back on the factoring host", mut("reserves", (s) => s.replace('{host === "banking" ? (', '{host !== "nobody" ? ('))],
  ];
  let pass = 0;
  for (const [name, files] of cases) {
    if (JSON.stringify(files) === JSON.stringify(base)) {
      console.error(`${LABEL} --selftest: mutation "${name}" did not change the source — fixture drifted`);
      process.exit(1);
    }
    if (analyze(files).problems.length === 0) {
      console.error(`${LABEL} --selftest: mutation escaped: ${name}`);
      process.exit(1);
    }
    pass++;
  }
  console.log(`${LABEL} --selftest PASS ${pass + 1}/${cases.length + 1}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const { problems, tiles } = analyze(readAll(ROOT));
    if (problems.length) {
      console.error(`${LABEL}: FAIL (${problems.length})\n  ${problems.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — 10 tabs; ${tiles.server} engine tiles + ${tiles.client} client tiles, no name or value twice, name and number only, one size`);
  }
}
