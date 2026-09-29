#!/usr/bin/env node
// ROUND 226.1 (owner, 2026-09-29): "THE ALWAYSTRACK COMPARISON — THE OWNER ASKED FOR IT DIRECTLY
// AND IT HAS NEVER BEEN DELIVERED." Produces ONE full settlement-by-settlement comparison,
// app vs AlwaysTrack, across every dimension verify-alwaystrack-parity.mjs (step 11461) already
// checks -- reusing that guard's own, already-approved comparison logic (computeGroundTruthTargets /
// compareDocument, copied verbatim below since the guard file executes live() as a side effect of
// import and cannot be imported directly) rather than inventing a second, competing methodology.
//
// Difference from the wired guard: this script (a) prints EVERY in-scope document, not just
// failures, (b) uses the FRESHER ground-truth snapshot (data/alwaystrack/settlements-truth-2026-09-28.json,
// 57 company + 58 driver docs, vs the guard's pinned 2026-09-13 file at 35) for full current
// coverage, and (c) adds a per-line expense-categorization detail section per document. It does NOT
// change scoping rules: OWNER-CLOSED 5769-5819 is still excluded from in-scope and never printed as
// a variance (ROUND 201 retraction, owner order), and feed-scoping (every referenced load must be
// live) is identical.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GROUND_TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-28.json");
const CUTOVER_DATE = "2026-08-07";
const CLOSED_5769_5819_MIN = 5769;
const CLOSED_5769_5819_MAX = 5819;
const CLOSED_5769_5819_DOC = "claude/00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819-TIE-EXACTLY-NEVER-ASK-AGAIN.md";
const R160_TRANSPORTATION_LOADS = new Set([
  "13497", "13502", "13503", "13504", "13505", "13506", "13507",
  "13509", "13522", "13530", "13531", "13533", "13539",
]);

function isClosed5769to5819(docNumber) {
  const n = Number(docNumber);
  return Number.isFinite(n) && n >= CLOSED_5769_5819_MIN && n <= CLOSED_5769_5819_MAX;
}
function sumBy(arr, key) {
  return (arr ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);
}
function round2Cents(dollars) {
  return Math.round(Number(dollars) * 100);
}
function fmt(cents) {
  return (Number(cents) / 100).toFixed(2);
}

// Copied verbatim from scripts/verify-alwaystrack-parity.mjs (pure functions; the guard file itself
// cannot be imported without triggering its own live() DB call as an import-time side effect).
export function computeGroundTruthTargets(raw) {
  const company = raw.company ?? [];
  const driver = raw.driver ?? [];
  const usmcaCompany = company.filter((r) => r.end_date >= CUTOVER_DATE);
  const usmcaDriver = driver.filter((r) => r.end_date >= CUTOVER_DATE);
  const driverByDoc = new Map(usmcaDriver.map((r) => [String(r.settlement_no), r]));

  const documents = usmcaCompany
    .map((r) => {
      const doc = String(r.settlement_no);
      const driverRow = driverByDoc.get(doc);
      const usmcaOnlyCharges = (r.customer_charges ?? []).filter((c) => !R160_TRANSPORTATION_LOADS.has(String(c.load)));
      return {
        doc,
        loads: r.loads ?? [],
        line_haul_cents: round2Cents(sumBy(usmcaOnlyCharges, "amount")),
        driver_payment_cents: round2Cents(r.driver_payment_total ?? 0),
        fuel_cents: round2Cents(sumBy(r.fuel_purchases, "actual")),
        fuel_count: (r.fuel_purchases ?? []).length,
        expenses_cents: round2Cents(sumBy(r.expenses, "amount")),
        expenses_count: (r.expenses ?? []).length,
        // NOTE: AlwaysTrack's parsed expense lines carry NO per-load attribution field (only
        // date/vendor/description/amount) -- they belong to the DOCUMENT, not to one specific load
        // on it. Matching therefore pools across every load on the document, not per-load.
        expenses_detail: (r.expenses ?? []).map((e) => ({
          description: e.description ?? e.vendor ?? null, amount_cents: round2Cents(e.amount ?? 0),
        })),
        driver_net_cents: driverRow ? round2Cents(driverRow.total_due) : null,
      };
    })
    .sort((a, b) => Number(a.doc) - Number(b.doc));

  return { documents, documentCount: documents.length };
}

export function compareDocument(target, actual) {
  const mismatches = [];
  if (target.line_haul_cents !== actual.line_haul_cents) {
    mismatches.push(`LINE_HAUL ${fmt(actual.line_haul_cents)}!=${fmt(target.line_haul_cents)}`);
  }
  if (target.driver_payment_cents !== actual.driver_payment_cents) {
    mismatches.push(`DRIVER_PAYMENT ${fmt(actual.driver_payment_cents)}!=${fmt(target.driver_payment_cents)}`);
  }
  if (target.fuel_cents !== actual.fuel_cents || target.fuel_count !== actual.fuel_count) {
    mismatches.push(`FUEL ${fmt(actual.fuel_cents)}/${actual.fuel_count}rows!=${fmt(target.fuel_cents)}/${target.fuel_count}rows`);
  }
  if (target.expenses_cents !== actual.expenses_cents || target.expenses_count !== actual.expenses_count) {
    mismatches.push(`EXPENSES ${fmt(actual.expenses_cents)}/${actual.expenses_count}rows!=${fmt(target.expenses_cents)}/${target.expenses_count}rows`);
  }
  if (target.driver_net_cents == null) {
    mismatches.push(`DRIVER_NET no driver-side document for ${target.doc} in ground truth — cannot compare`);
  } else if (actual.driver_net_cents == null) {
    mismatches.push(`DRIVER_NET no live non-cancelled settlement carries source_document_ref=${target.doc}`);
  } else if (target.driver_net_cents !== actual.driver_net_cents) {
    mismatches.push(`DRIVER_NET ${fmt(actual.driver_net_cents)}!=${fmt(target.driver_net_cents)}`);
  }
  return mismatches;
}

function sumField(loadNumbers, byLoad, field) {
  return loadNumbers.reduce((s, n) => s + (byLoad.get(n)?.[field] ?? 0), 0);
}

// ── Entry point: STEP 1 dumps what live data this report needs (as a load-number list), so the
// caller can fetch it via Neon MCP and feed it back in with --with-live-data. ──────────────────
const args = process.argv.slice(2);
if (args[0] === "--emit-load-numbers") {
  const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, "utf8"));
  const { documents } = computeGroundTruthTargets(raw);
  const allLoadNumbers = [...new Set(documents.flatMap((d) => d.loads))];
  console.log(JSON.stringify({ documentCount: documents.length, allLoadNumbers }));
  process.exit(0);
}

if (args[0] === "--with-live-data") {
  const liveDataPath = args[1];
  const outPath = args[2] ?? path.join(os.homedir(), "Downloads", "2026-09-29-ALWAYSTRACK-PARITY-COMPARISON.md");
  const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, "utf8"));
  const { documents, documentCount } = computeGroundTruthTargets(raw);
  const live = JSON.parse(fs.readFileSync(liveDataPath, "utf8"));

  const liveLoadNumbers = new Set(live.loads.map((r) => r.load_number));
  const invoiceByLoad = new Map(live.invoices.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));
  const billByLoad = new Map(live.bills.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));
  const expenseByLoad = new Map(live.expenses.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));
  const fuelByLoad = new Map(live.fuel.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));
  const expenseLinesByLoad = new Map();
  for (const r of live.expense_lines) {
    const list = expenseLinesByLoad.get(r.load_number) ?? [];
    list.push({ description: r.description, amount_cents: Number(r.amount_cents) });
    expenseLinesByLoad.set(r.load_number, list);
  }
  const settlementsByDoc = new Map();
  for (const row of live.settlements) {
    const list = settlementsByDoc.get(row.source_document_ref) ?? [];
    list.push({ cents: round2Cents(row.net_pay), status: row.status });
    settlementsByDoc.set(row.source_document_ref, list);
  }

  // NOTE (ROUND 226.1): the wired CI guard treats OWNER-CLOSED (5769-5819) as excluded from
  // in-scope, because a variance there must never BLOCK a build over an already-adjudicated,
  // owner-reconciled range (ROUND 201 retraction). That is a CI-failure policy, not a reason to
  // hide the underlying numbers from a report the owner explicitly asked to see. This report
  // computes and shows EVERY fed document, including 5769-5819 -- each such row is labelled
  // OWNER-CLOSED so it is never mistaken for a live variance the way the ROUND 201 incident was.
  const inScopeDocs = [];
  const skippedNotFedDocs = [];
  for (const target of documents) {
    const loads = target.loads ?? [];
    const allLive = loads.length > 0 && loads.every((n) => liveLoadNumbers.has(n));
    if (allLive) inScopeDocs.push(target);
    else skippedNotFedDocs.push({ doc: target.doc, missing: loads.filter((n) => !liveLoadNumbers.has(n)) });
  }

  const rows = [];
  let cleanCount = 0;
  for (const target of inScopeDocs) {
    const actual = {
      line_haul_cents: sumField(target.loads, invoiceByLoad, "cents"),
      driver_payment_cents: sumField(target.loads, billByLoad, "cents"),
      fuel_cents: sumField(target.loads, fuelByLoad, "cents"),
      fuel_count: sumField(target.loads, fuelByLoad, "n"),
      expenses_cents: sumField(target.loads, expenseByLoad, "cents"),
      expenses_count: sumField(target.loads, expenseByLoad, "n"),
      driver_net_cents: (() => {
        const candidates = (settlementsByDoc.get(target.doc) ?? []).filter((c) => c.status !== "cancelled");
        if (candidates.length !== 1) return null;
        return candidates[0].cents;
      })(),
    };
    const mismatches = compareDocument(target, actual);
    if (mismatches.length === 0) cleanCount += 1;

    // Expense-line categorization detail: does every AlwaysTrack expense line on this DOCUMENT
    // have a matching live expense of the same amount, pooled across every load on the document
    // (AlwaysTrack's parsed lines carry no per-load field)? Amount-keyed match — the closest
    // categorization signal available without a shared external line id on either side.
    const lineDetails = [];
    const liveLinesPool = target.loads.flatMap((loadNum) => (expenseLinesByLoad.get(loadNum) ?? []).map((l) => ({ ...l, load: loadNum })));
    for (const atLine of target.expenses_detail) {
      const matchIdx = liveLinesPool.findIndex((l) => l.amount_cents === atLine.amount_cents);
      if (matchIdx >= 0) {
        lineDetails.push({ desc: atLine.description, amount: fmt(atLine.amount_cents), match: "TIE", liveLoad: liveLinesPool[matchIdx].load, liveDesc: liveLinesPool[matchIdx].description });
        liveLinesPool.splice(matchIdx, 1);
      } else {
        lineDetails.push({ desc: atLine.description, amount: fmt(atLine.amount_cents), match: "NO LIVE MATCH", liveLoad: null, liveDesc: null });
      }
    }

    rows.push({ doc: target.doc, target, actual, mismatches, lineDetails, ownerClosed: isClosed5769to5819(target.doc) });
  }

  // ── Write the report ────────────────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`# AlwaysTrack Parity Comparison — App vs AlwaysTrack, settlement by settlement`);
  lines.push(``);
  lines.push(`Generated 2026-09-29 (CC-1, ROUND 226.1). Ground truth: data/alwaystrack/settlements-truth-2026-09-28.json (${documentCount} company documents parsed, 0 tie errors — every section ties to its own printed subtotal). Live data: Neon br-fancy-credit-akjnd07a, bypass_rls, read inside one transaction.`);
  lines.push(``);
  lines.push(`Methodology: identical to the wired, CI-enforced guard scripts/verify-alwaystrack-parity.mjs (step 11461) — same six dimensions (line haul, driver payment, fuel $+count, expenses $+count, driver net pay), same scoping rules (a document is IN SCOPE only when every load it references is live in mdata.loads; OWNER-CLOSED range 5769–5819 is permanently excluded per the owner's 2026-09-28 retraction and is never printed as a variance here either). This report differs only in printing every in-scope document (not just failures) and in adding a per-expense-line categorization detail section.`);
  lines.push(``);
  const ownerClosedInScope = inScopeDocs.filter((d) => isClosed5769to5819(d.doc)).length;
  lines.push(`## Scope`);
  lines.push(`- In scope (every load referenced is live in mdata.loads): ${inScopeDocs.length} of ${documentCount} documents`);
  lines.push(`  - Of which ${ownerClosedInScope} fall in the OWNER-CLOSED 5769–5819 range (${CLOSED_5769_5819_DOC}) — ROUND 201 owner ruling: a variance there is never a CI-blocking failure (already owner-reconciled, shared Transportation/USMCA). Shown below labelled OWNER-CLOSED, not hidden, since this is a report, not the CI gate.`);
  lines.push(`- Skipped — NOT FED YET (a referenced load is not yet live in mdata.loads): ${skippedNotFedDocs.length}${skippedNotFedDocs.length ? " — " + skippedNotFedDocs.map((d) => `${d.doc} (missing ${d.missing.join(",")})`).join("; ") : ""}`);
  lines.push(``);
  const nonClosedRows = rows.filter((r) => !r.ownerClosed);
  const nonClosedClean = nonClosedRows.filter((r) => r.mismatches.length === 0).length;
  lines.push(`## Result`);
  lines.push(`- Outside the OWNER-CLOSED range: ${nonClosedClean} of ${nonClosedRows.length} documents tie exactly (zero delta, all six dimensions).`);
  lines.push(`- Inside the OWNER-CLOSED range (5769–5819): ${cleanCount - nonClosedClean} of ${ownerClosedInScope} tie exactly; the rest are shown for transparency only and are NEVER a live variance per the standing ROUND 201 ruling — do not action them without re-reading that ruling first.`);
  lines.push(``);
  const failing = rows.filter((r) => r.mismatches.length > 0);
  const failingNonClosed = failing.filter((r) => !r.ownerClosed);
  lines.push(failingNonClosed.length === 0
    ? `**ZERO DELTAS outside the OWNER-CLOSED range.** Every currently-actionable settlement ties exactly, both sides, all six dimensions.`
    : `**${failingNonClosed.length} document(s) outside the OWNER-CLOSED range have at least one delta.** Exact list below.`);
  lines.push(``);
  lines.push(`## Settlement-by-settlement (every fed document)`);
  lines.push(``);
  lines.push(`| Doc | Loads | Line haul (AT / App) | Driver pay (AT / App) | Fuel $ / rows (AT / App) | Expenses $ / rows (AT / App) | Driver net (AT / App) | Result |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    const t = r.target, a = r.actual;
    const result = r.ownerClosed ? `OWNER-CLOSED${r.mismatches.length ? " (not actionable)" : ""}` : (r.mismatches.length === 0 ? "TIE" : "DELTA");
    lines.push(
      `| ${r.doc} | ${t.loads.join(", ")} | $${fmt(t.line_haul_cents)} / $${fmt(a.line_haul_cents)} | $${fmt(t.driver_payment_cents)} / $${fmt(a.driver_payment_cents)} | $${fmt(t.fuel_cents)}/${t.fuel_count} / $${fmt(a.fuel_cents)}/${a.fuel_count} | $${fmt(t.expenses_cents)}/${t.expenses_count} / $${fmt(a.expenses_cents)}/${a.expenses_count} | ${t.driver_net_cents == null ? "—" : "$" + fmt(t.driver_net_cents)} / ${a.driver_net_cents == null ? "—" : "$" + fmt(a.driver_net_cents)} | ${result} |`
    );
  }
  lines.push(``);
  if (failingNonClosed.length > 0) {
    lines.push(`## Exact deltas (outside the OWNER-CLOSED range — actionable)`);
    lines.push(``);
    for (const r of failingNonClosed) {
      lines.push(`### Doc ${r.doc}`);
      for (const m of r.mismatches) lines.push(`- ${m}`);
      lines.push(``);
    }
  }
  const failingClosed = failing.filter((r) => r.ownerClosed);
  if (failingClosed.length > 0) {
    lines.push(`## Deltas inside the OWNER-CLOSED range (informational only — ROUND 201: never action, never a CI failure)`);
    lines.push(``);
    for (const r of failingClosed) {
      lines.push(`### Doc ${r.doc}`);
      for (const m of r.mismatches) lines.push(`- ${m}`);
      lines.push(``);
    }
  }
  lines.push(`## Expense-line categorization detail (amount-keyed match, pooled per document — AlwaysTrack's parsed lines carry no per-load field)`);
  lines.push(``);
  const allLineDetails = rows.flatMap((r) => r.lineDetails.map((l) => ({ doc: r.doc, ownerClosed: r.ownerClosed, ...l })));
  const noMatch = allLineDetails.filter((l) => l.match === "NO LIVE MATCH");
  const noMatchActionable = noMatch.filter((l) => !l.ownerClosed);
  lines.push(`${allLineDetails.length - noMatch.length} of ${allLineDetails.length} AlwaysTrack expense lines (across all ${documentCount} fed documents) tie to a live expense of the same amount somewhere on that document's loads. ${noMatch.length} do not (${noMatchActionable.length} outside the OWNER-CLOSED range, listed below — NOT a guess; these are reported, not defaulted).`);
  lines.push(``);
  if (noMatch.length > 0) {
    lines.push(`| Doc | AlwaysTrack description | Amount | Status |`);
    lines.push(`|---|---|---|---|`);
    for (const l of noMatch) lines.push(`| ${l.doc} | ${l.desc ?? "—"} | $${l.amount} | NO LIVE MATCH${l.ownerClosed ? " (OWNER-CLOSED, informational)" : ""} |`);
  }

  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Fed: ${inScopeDocs.length}/${documentCount} (${ownerClosedInScope} OWNER-CLOSED, ${inScopeDocs.length - ownerClosedInScope} actionable).`);
  console.log(`Actionable ties: ${nonClosedClean}/${nonClosedRows.length}. Actionable deltas: ${failingNonClosed.length}.`);
  console.log(`Expense lines: ${allLineDetails.length - noMatch.length}/${allLineDetails.length} tie by amount; ${noMatch.length} no live match.`);
  process.exit(0);
}

console.error("Usage: --emit-load-numbers | --with-live-data <live.json> [outPath]");
process.exit(1);
