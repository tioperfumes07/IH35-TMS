#!/usr/bin/env node
/**
 * verify-matrix-live-leaf-explicit — LV-MATRIX-LIVE-KEYWORD-FANOUT
 *   + LV-MATRIX-LEAVES-CELLS-ALLOWLIST-BYPASS
 *   + LV-MATRIX-LATER-FAIL-DOES-NOT-SUPERSEDE-OLD-LIVE
 *
 * ROOT CAUSE: Box 4 Live used leafTouchesText (stem / sub / route-tail substring) against
 * AUDIT-COVERAGE-LIVE PROD-VERIFIED rows. ~26 PV rows greened ~906/3446 Live cells (26%) —
 * dishonest vs MODULE-MATRIX-SCOREBOARD-LOCKED (Live = PROD-VERIFIED on that leaf×column).
 *
 * Also: Leaves/cells `leaf:col` closed declarations were ignored (only Exact cell(s) counted),
 * so narrative backticks like "no `driver`" inflated Live. And older PROD-VERIFIED survived a
 * newer FAIL for the same leaf×column.
 *
 * FIX: leafColumnLiveReason requires leafExplicitlyNamedInLiveEvidence; explicitlyNamedLiveColumns
 * parses Exact cell(s) AND Leaves/cells leaf:col allowlists; later FAIL supersedes older Live.
 *
 * Lockstep: apps/backend/src/program/module-matrix.service.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-live-leaf-explicit";
const SERVICE = "apps/backend/src/program/module-matrix.service.ts";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lockstep with module-matrix.service.ts */
export function leafExplicitlyNamedInLiveEvidence(leaf, text) {
  const id = String(leaf?.id ?? "").trim();
  if (!id) return false;
  const hay = String(text ?? "");
  if (hay.includes(`\`${id}\``)) return true;
  if (new RegExp(`\`${escapeRegExp(id)}:[a-z0-9_,.\\-]+\``, "i").test(hay)) return true;
  const idToken = new RegExp(
    `(?:^|[\\s·,;/\\|\\(\\[\\{"'])${escapeRegExp(id)}(?:$|[\\s·,;/\\|\\)\\]\\}"'\\.\`])`,
  );
  if (/\bLeaves?(?:\/cells)?\s*:/i.test(hay) && idToken.test(hay)) return true;
  if (
    new RegExp(
      `\\bleaf(?:_id|Id|\\s*id)?\\s*[:=]\\s*\`?${escapeRegExp(id)}\`?(?:\\b|$)`,
      "i",
    ).test(hay)
  ) {
    return true;
  }
  const route = String(leaf.route_hint ?? "")
    .replace(/\/:[^/]+/g, "")
    .replace(/\/$/, "");
  if (route && route.length >= 6) {
    if (hay.includes(`\`${route}\``)) return true;
    if (new RegExp(`(?:https?:\\/\\/[^\\s\`"]+)?${escapeRegExp(route)}(?:[?#\\s\`"']|$)`).test(hay)) {
      return true;
    }
  }
  return false;
}

/** Lockstep with module-matrix.service.ts */
export function explicitlyNamedLiveColumns(text, leafId) {
  const hay = String(text ?? "");
  const cols = new Set();
  let closed = false;

  const exactMatch = hay.match(/\bExact cells?(?:\s+[^=\n|:]*?)?\s*:\s*([^\n|]*?)(?:\.\s|$)/i);
  if (exactMatch?.[1] !== undefined) {
    closed = true;
    for (const match of exactMatch[1].matchAll(/`([a-z][a-z0-9_.-]*)`/gi)) {
      cols.add(match[1].toLowerCase());
    }
  }

  if (/\bLeaves?(?:\/cells)?\s*:/i.test(hay)) {
    const leafScoped = Array.from(hay.matchAll(/`([a-z][a-z0-9_.-]*)(?::([a-z0-9_.,\-]+))?`/gi));
    if (leafScoped.some((m) => m[2])) {
      closed = true;
      const want = leafId?.trim().toLowerCase();
      for (const match of leafScoped) {
        const namedLeaf = match[1].toLowerCase();
        const colPart = match[2];
        if (!colPart) continue;
        if (want && namedLeaf !== want) continue;
        for (const col of colPart.split(",")) {
          const c = col.trim().toLowerCase();
          if (c) cols.add(c);
        }
      }
    }
  }

  if (!closed) return null;
  return cols;
}

function assertServiceWiring(src) {
  const errs = [];
  if (!/export function leafExplicitlyNamedInLiveEvidence\b/.test(src)) {
    errs.push("missing export leafExplicitlyNamedInLiveEvidence");
  }
  if (!/export function explicitlyNamedLiveColumns\b/.test(src)) {
    errs.push("missing export explicitlyNamedLiveColumns");
  }
  if (!/export function leafColumnHasLaterContradictingFail\b/.test(src)) {
    errs.push("missing export leafColumnHasLaterContradictingFail");
  }
  if (!/declaration\.matchAll\(\/`\(\[a-z\]\[a-z0-9_\.\-\]\*\)`\/gi\)/.test(src) && !/`\(\[a-z\]\[a-z0-9_\.\-\]\*\)`\/gi/.test(src)) {
    errs.push("Exact cell(s) parser must retain dotted/hyphenated column ids");
  }
  if (!/Leaves\?\(\?:\\\/cells\)\?/.test(src)) {
    errs.push("explicitlyNamedLiveColumns / leaf match must recognize Leaves/cells: closed form");
  }
  const liveFn = src.match(/function leafColumnLiveReason\([\s\S]*?\n\}/);
  if (!liveFn) {
    errs.push("leafColumnLiveReason not found");
  } else {
    if (!/leafExplicitlyNamedInLiveEvidence\(leaf,\s*hay\)/.test(liveFn[0])) {
      errs.push("leafColumnLiveReason must call leafExplicitlyNamedInLiveEvidence(leaf, hay)");
    }
    if (/leafTouchesText\(leaf,\s*hay\)/.test(liveFn[0])) {
      errs.push("leafColumnLiveReason must NOT call leafTouchesText (fan-out)");
    }
    if (!/explicitlyNamedLiveColumns\(hay,\s*leaf\.id\)/.test(liveFn[0])) {
      errs.push("leafColumnLiveReason must parse Exact cell(s)/Leaves/cells declarations with leaf id");
    }
    if (!/declaredColumns\s*&&\s*!declaredColumns\.has\(colId\.toLowerCase\(\)\)/.test(liveFn[0])) {
      errs.push("leafColumnLiveReason must reject columns outside the Exact cell(s) allowlist");
    }
    if (!/leafColumnHasLaterContradictingFail\(leaf,\s*colId,\s*moduleId,\s*ledger,\s*row\.num\)/.test(liveFn[0])) {
      errs.push("leafColumnLiveReason must skip Live when a later FAIL exists for the same leaf×column");
    }
  }
  if (!/no stem\/keyword fan-out/.test(src) && !/LV-MATRIX-LIVE-KEYWORD-FANOUT/.test(src)) {
    errs.push("service must document LV-MATRIX-LIVE-KEYWORD-FANOUT / no stem fan-out");
  }
  if (!/LV-MATRIX-LEAVES-CELLS-ALLOWLIST-BYPASS/.test(src)) {
    errs.push("service must document LV-MATRIX-LEAVES-CELLS-ALLOWLIST-BYPASS");
  }
  if (!/LV-MATRIX-LATER-FAIL-DOES-NOT-SUPERSEDE-OLD-LIVE/.test(src)) {
    errs.push("service must document LV-MATRIX-LATER-FAIL-DOES-NOT-SUPERSEDE-OLD-LIVE");
  }
  if (!/LV-MATRIX-LEDGER-PARSE-SWALLOW-ZEROS-BOX4/.test(src)) {
    errs.push("service must document LV-MATRIX-LEDGER-PARSE-SWALLOW-ZEROS-BOX4");
  }
  const loadLedger = src.match(/async function loadLedgerRows\([\s\S]*?\n\}/);
  if (!loadLedger) {
    errs.push("loadLedgerRows not found");
  } else {
    if (/catch\s*\{[\s\S]*?return\s*\[\s*\]\s*;/.test(loadLedger[0])) {
      errs.push(
        "loadLedgerRows must NOT catch-and-return [] (silent empty ledger zeros Box 4 Live)",
      );
    }
    if (!/parseFindings\(md\)/.test(loadLedger[0])) {
      errs.push("loadLedgerRows must call parseFindings(md)");
    }
    if (!/loadOutboxTextFromGithub/.test(loadLedger[0]) || !/LEDGER_REL/.test(loadLedger[0])) {
      errs.push(
        "loadLedgerRows must GitHub-fetch AUDIT-COVERAGE-LIVE.md (Render docs/** ignore)",
      );
    }
  }
  return errs;
}

function selftest() {
  const fuzzyOnly =
    "PROD-VERIFIED — accounting GL integrity walked; bills vendors journal posting route wiring";
  const leaf = { id: "coa.accounts.list", route_hint: "/accounting/chart-of-accounts", sub: "Accounts" };
  if (leafExplicitlyNamedInLiveEvidence(leaf, fuzzyOnly)) {
    throw new Error(`${LABEL} SELFTEST FAIL — fuzzy stem/keyword blob must NOT match leaf`);
  }
  const explicit = `PROD-VERIFIED — Cursor Live Chrome. Leaves: \`hub.home\` · \`coa.accounts.list\`. VERIFY-1 qbo_chrome.`;
  if (!leafExplicitlyNamedInLiveEvidence(leaf, explicit)) {
    throw new Error(`${LABEL} SELFTEST FAIL — backtick leaf id in Leaves: must match`);
  }
  const routeOnly = `PROD-VERIFIED — opened https://app.ih35dispatch.com/accounting/chart-of-accounts Search+Range`;
  if (!leafExplicitlyNamedInLiveEvidence(leaf, routeOnly)) {
    throw new Error(`${LABEL} SELFTEST FAIL — full route_hint path must match`);
  }
  const otherLeaf = { id: "bills.list", route_hint: "/accounting/bills", sub: "Bills" };
  if (leafExplicitlyNamedInLiveEvidence(otherLeaf, explicit)) {
    throw new Error(`${LABEL} SELFTEST FAIL — must not credit unrelated leaf from Leaves list`);
  }
  const scopedEvidence =
    "PROD-VERIFIED. Leaf: `md.new_transaction`. Exact cells: `customer`, `qbo_chrome`, `connectivity`, `scenario.dispatch`. Opened /accounting/invoices; reverse and invoice are not claimed.";
  const scopedColumns = explicitlyNamedLiveColumns(scopedEvidence);
  if (
    !scopedColumns ||
    !scopedColumns.has("customer") ||
    !scopedColumns.has("qbo_chrome") ||
    !scopedColumns.has("connectivity") ||
    !scopedColumns.has("scenario.dispatch")
  ) {
    throw new Error(`${LABEL} SELFTEST FAIL — Exact cells declaration must retain simple and dotted columns`);
  }
  if (scopedColumns.has("invoice") || scopedColumns.has("reverse_link")) {
    throw new Error(`${LABEL} SELFTEST FAIL — narrative route/non-claim words must not broaden Exact cells`);
  }

  // LV-MATRIX-LEAVES-CELLS-ALLOWLIST-BYPASS — fuel #1560 shape
  const leavesCells =
    "**Leaves/cells:** `card_overage:connectivity` · `chrome.toolbar_search:connectivity` · `chrome.toolbar_range:connectivity`. intentionally claims no `driver`, `unit`, or `reverse_link`.";
  const overageCols = explicitlyNamedLiveColumns(leavesCells, "card_overage");
  if (!overageCols || !overageCols.has("connectivity")) {
    throw new Error(`${LABEL} SELFTEST FAIL — Leaves/cells must allowlist connectivity for card_overage`);
  }
  if (overageCols.has("driver") || overageCols.has("unit") || overageCols.has("reverse_link")) {
    throw new Error(`${LABEL} SELFTEST FAIL — narrative exclusion backticks must not enter Leaves/cells allowlist`);
  }
  const searchCols = explicitlyNamedLiveColumns(leavesCells, "chrome.toolbar_search");
  if (!searchCols?.has("connectivity") || searchCols.has("driver")) {
    throw new Error(`${LABEL} SELFTEST FAIL — Leaves/cells leaf-scoping must keep toolbar_search=connectivity only`);
  }
  if (!leafExplicitlyNamedInLiveEvidence({ id: "card_overage", route_hint: "/fuel/card-overage" }, leavesCells)) {
    throw new Error(`${LABEL} SELFTEST FAIL — \`leaf:col\` form must name the leaf`);
  }

  const claimedOnly =
    "PROD-VERIFIED. Exact cells claimed only where exercised: `connectivity`, `load`. Not claimed: picker_law.";
  const claimedCols = explicitlyNamedLiveColumns(claimedOnly);
  if (!claimedCols?.has("connectivity") || !claimedCols.has("load") || claimedCols.has("picker_law")) {
    throw new Error(`${LABEL} SELFTEST FAIL — Exact cells with prose before colon must parse allowlist only`);
  }

  const src = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const wireErrs = assertServiceWiring(src);
  if (wireErrs.length) {
    throw new Error(`${LABEL} SELFTEST FAIL — service wiring:\n- ${wireErrs.join("\n- ")}`);
  }

  const liveFnSrc = src.match(/function leafColumnLiveReason\([\s\S]*?\n\}/)?.[0] ?? "";
  const mutatedLive = liveFnSrc.replace(
    /leafExplicitlyNamedInLiveEvidence\(leaf,\s*hay\)/,
    "leafTouchesText(leaf, hay)",
  );
  if (mutatedLive === liveFnSrc) {
    throw new Error(`${LABEL} SELFTEST FAIL — could not plant leafTouchesText mutation`);
  }
  const liveIdx = src.indexOf(liveFnSrc);
  if (liveIdx < 0) {
    throw new Error(`${LABEL} SELFTEST FAIL — liveFnSrc not found in service source`);
  }
  const mutated = src.slice(0, liveIdx) + mutatedLive + src.slice(liveIdx + liveFnSrc.length);
  const planted = assertServiceWiring(mutated);
  if (!planted.some((e) => /must NOT call leafTouchesText|must call leafExplicitlyNamedInLiveEvidence/.test(e))) {
    throw new Error(
      `${LABEL} SELFTEST FAIL — planted fan-out mutation was not detected\n- ${planted.join("\n- ") || "(no errs)"}`,
    );
  }
  const widened = src.replace(
    /declaredColumns\s*&&\s*!declaredColumns\.has\(colId\.toLowerCase\(\)\)/,
    "false",
  );
  if (widened === src) {
    throw new Error(`${LABEL} SELFTEST FAIL — could not plant Exact cells allowlist bypass`);
  }
  const widenedErrs = assertServiceWiring(widened);
  if (!widenedErrs.some((e) => /outside the Exact cell\(s\) allowlist/.test(e))) {
    throw new Error(`${LABEL} SELFTEST FAIL — planted Exact cells allowlist bypass was not detected`);
  }
  const noLater = src.replace(
    /leafColumnHasLaterContradictingFail\(leaf,\s*colId,\s*moduleId,\s*ledger,\s*row\.num\)/,
    "false",
  );
  if (noLater === src) {
    throw new Error(`${LABEL} SELFTEST FAIL — could not plant later-FAIL supersede bypass`);
  }
  const noLaterErrs = assertServiceWiring(noLater);
  if (!noLaterErrs.some((e) => /later FAIL/.test(e))) {
    throw new Error(`${LABEL} SELFTEST FAIL — planted later-FAIL supersede bypass was not detected`);
  }
  const noLeaves = src.replace(/Leaves\?\(\?:\\\/cells\)\?/g, "Leaves?");
  if (noLeaves === src) {
    // try unescaped form in template literals / comments — mutation on Leaves/cells doc id instead
    const noDoc = src.replace(/LV-MATRIX-LEAVES-CELLS-ALLOWLIST-BYPASS/g, "LV-MATRIX-LEAVES-REMOVED");
    if (noDoc === src) {
      throw new Error(`${LABEL} SELFTEST FAIL — could not plant Leaves/cells documentation regression`);
    }
    const noDocErrs = assertServiceWiring(noDoc);
    if (!noDocErrs.some((e) => /LEAVES-CELLS-ALLOWLIST-BYPASS/.test(e))) {
      throw new Error(`${LABEL} SELFTEST FAIL — planted Leaves/cells doc regression was not detected`);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const errs = assertServiceWiring(src);
  if (errs.length) {
    console.error(`${LABEL} FAILED:`);
    for (const e of errs) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — Box 4 Live: explicit leaf · Leaves/cells allowlist · later FAIL supersedes stale Live`,
  );
}

main();
