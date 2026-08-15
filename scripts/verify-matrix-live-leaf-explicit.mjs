#!/usr/bin/env node
/**
 * verify-matrix-live-leaf-explicit — LV-MATRIX-LIVE-KEYWORD-FANOUT.
 *
 * ROOT CAUSE: Box 4 Live used leafTouchesText (stem / sub / route-tail substring) against
 * AUDIT-COVERAGE-LIVE PROD-VERIFIED rows. ~26 PV rows greened ~906/3446 Live cells (26%) —
 * dishonest vs MODULE-MATRIX-SCOREBOARD-LOCKED (Live = PROD-VERIFIED on that leaf×column).
 *
 * FIX: leafColumnLiveReason requires leafExplicitlyNamedInLiveEvidence (backticks, Leaves:
 * list, leaf_id=, or full route_hint). Fuzzy leafTouchesText remains for Box 2 Audited only.
 *
 * Lockstep: apps/backend/src/program/module-matrix.service.ts leafExplicitlyNamedInLiveEvidence.
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
  const idToken = new RegExp(
    `(?:^|[\\s·,;/\\|\\(\\[\\{"'])${escapeRegExp(id)}(?:$|[\\s·,;/\\|\\)\\]\\}"'\\.\`])`,
  );
  if (/\bLeaves?\s*:/i.test(hay) && idToken.test(hay)) return true;
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

function assertServiceWiring(src) {
  const errs = [];
  if (!/export function leafExplicitlyNamedInLiveEvidence\b/.test(src)) {
    errs.push("missing export leafExplicitlyNamedInLiveEvidence");
  }
  const liveFn = src.match(
    /function leafColumnLiveReason\([\s\S]*?\n\}/,
  );
  if (!liveFn) {
    errs.push("leafColumnLiveReason not found");
  } else {
    if (!/leafExplicitlyNamedInLiveEvidence\(leaf,\s*hay\)/.test(liveFn[0])) {
      errs.push("leafColumnLiveReason must call leafExplicitlyNamedInLiveEvidence(leaf, hay)");
    }
    if (/leafTouchesText\(leaf,\s*hay\)/.test(liveFn[0])) {
      errs.push("leafColumnLiveReason must NOT call leafTouchesText (fan-out)");
    }
  }
  if (!/no stem\/keyword fan-out/.test(src) && !/LV-MATRIX-LIVE-KEYWORD-FANOUT/.test(src)) {
    errs.push("service must document LV-MATRIX-LIVE-KEYWORD-FANOUT / no stem fan-out");
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

  const src = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  // Plant: temporarily require that wiring assertions pass on real source
  const wireErrs = assertServiceWiring(src);
  if (wireErrs.length) {
    throw new Error(`${LABEL} SELFTEST FAIL — service wiring:\n- ${wireErrs.join("\n- ")}`);
  }

  // Mutation: if leafColumnLiveReason used leafTouchesText again, fail
  const mutated = src.replace(
    /leafExplicitlyNamedInLiveEvidence\(leaf,\s*hay\)/,
    "leafTouchesText(leaf, hay)",
  );
  if (mutated === src) {
    throw new Error(`${LABEL} SELFTEST FAIL — could not plant leafTouchesText mutation`);
  }
  const planted = assertServiceWiring(mutated);
  if (!planted.some((e) => /must NOT call leafTouchesText|must call leafExplicitlyNamedInLiveEvidence/.test(e))) {
    throw new Error(`${LABEL} SELFTEST FAIL — planted fan-out mutation was not detected`);
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
  console.log(`${LABEL} PASS — Box 4 Live requires explicit leaf naming (no stem fan-out)`);
}

main();
