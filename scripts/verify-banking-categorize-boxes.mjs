#!/usr/bin/env node
/**
 * verify-banking-categorize-boxes — BANK-DESIGN-1 (owner 2026-09-06, verbatim: "IN BANKING WE NEED A CLEAR OUTLINE
 * BETWEEN THE TRANSACTION BEING CATEGORIZED. A DARKER OUTLINE IN BOTH LARGE BOXES, IN MATCH CANDIDATES AND ON THE
 * LEFT SIDE. IN MATCH CANDIDATES I WANT CLEARER DIVISION BETWEEN THE SUGGESTIONS, ORGANIZED CORRECTLY, DATE, THEN
 * DESCRIPTION, ETC. … CLEANER LIKE QUICKBOOKS. AND I WANT THE NEW COLORS IN BANKING AS WELL. THE COLORS YOU
 * IMPLEMENTED IN THE LOAD COSTS.")
 *
 * MEASURED BEFORE (origin/main 199d226cb7, BankingTransactionsDesignView.tsx L1688-2489): the expanded row was a bare
 * lg:grid-cols-2 with the left column an unbordered <div class="p-1"> and the right column separated only by
 * `lg:border-l` (border-gray-200); every candidate was its own `border-gray-100` card (1px #f3f4f6 — invisible on
 * white) laid out KIND · AMOUNT / memo / "Date: … Amount gap: … Date gap: … Score: …" on three lines.
 *
 * PINS (source, apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx):
 *   1. both boxes are `.ldt-card strong` with testids banking-categorize-box / banking-match-candidates-box;
 *   2. each box opens with an `.ldt-ch` header band;
 *   3. the candidate register is `.ldt-rows ldt-rows-match` whose head row reads Date · Description · Type · Amount · Gap
 *      in that order; every candidate row carries data-testid banking-match-candidate-row and the `best` class when
 *      auto_match;
 *   4. no `border-gray-100` card remains inside the match pane (the invisible divider);
 *   5. the palette carries `.ldt-card.strong` (border-color: var(--ldt-ink2)) and `.ldt-rows-match .ldt-row` with a full
 *      `--ldt-rule` bottom border (styles/tokens-load-detail.css).
 *
 * Usage: node scripts/verify-banking-categorize-boxes.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VIEW = path.join(ROOT, "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
const CSS = path.join(ROOT, "apps/frontend/src/styles/tokens-load-detail.css");
const LABEL = "verify-banking-categorize-boxes";

export function problemsFor(view, css) {
  const problems = [];
  const panelStart = view.indexOf('data-testid="banking-categorize-expanded-panel"');
  if (panelStart === -1) problems.push("expanded panel (banking-categorize-expanded-panel) missing");
  const panel = panelStart === -1 ? "" : view.slice(panelStart, view.indexOf("\n  return (", panelStart) === -1 ? undefined : view.indexOf("\n  return (", panelStart));

  for (const id of ["banking-categorize-box", "banking-match-candidates-box"]) {
    const re = new RegExp(`className="ldt-card strong"[^>]*data-testid="${id}"|data-testid="${id}"[^>]*className="ldt-card strong"`);
    if (!re.test(panel)) problems.push(`${id} is not an .ldt-card.strong (dark outline) box`);
  }
  if ((panel.match(/className="ldt-ch"/g) ?? []).length < 2) problems.push("both boxes must open with an .ldt-ch header band");

  const reg = panel.indexOf('className="ldt-rows ldt-rows-match"');
  if (reg === -1) problems.push("candidate register (.ldt-rows.ldt-rows-match) missing");
  else {
    const head = panel.slice(reg, panel.indexOf("</div>", panel.indexOf('className="ldt-row head"', reg)));
    // BANK-MATCH-QBO (owner 2026-09-06): QuickBooks "Find match" order — Date · Type · Ref no. · Payee ·
    // Description · Open balance · Amount · Gap.
    const order = ["<span>Date</span>", "<span>Type</span>", "<span>Ref no.</span>", "<span>Payee</span>", "<span>Description</span>", "Open balance</span>", "Amount</span>", "Gap ($ · days)</span>"];
    let last = -1;
    for (const cell of order) {
      const i = head.indexOf(cell);
      if (i === -1 || i < last) { problems.push(`candidate head row must read Date · Type · Ref no. · Payee · Description · Open balance · Amount · Gap (broke at ${cell})`); break; }
      last = i;
    }
    if (!/data-testid="banking-match-candidate-row"/.test(panel)) problems.push("candidate rows lack data-testid banking-match-candidate-row");
    if (!/candidate\.auto_match \? " best" : ""/.test(panel)) problems.push("auto_match row must carry the `best` class");
  }
  if (/border-gray-100/.test(panel)) problems.push("border-gray-100 (invisible divider) still inside the expanded panel");

  if (!/\.ldt-card\.strong\s*\{\s*border-color:\s*var\(--ldt-ink2\)/.test(css)) problems.push("tokens: .ldt-card.strong { border-color: var(--ldt-ink2) } missing");
  if (!/\.ldt-rows-match \.ldt-row\s*\{[^}]*border-bottom:\s*1px solid var\(--ldt-rule\)/.test(css)) problems.push("tokens: .ldt-rows-match .ldt-row needs a full --ldt-rule bottom border");
  return problems;
}

function selftest() {
  const view = fs.readFileSync(VIEW, "utf8");
  const css = fs.readFileSync(CSS, "utf8");
  if (problemsFor(view, css).length) { console.error(`${LABEL} SELFTEST: baseline is not clean:`, problemsFor(view, css)); process.exit(1); }
  const mutants = [
    ["left box loses the dark outline", view.replace('className="ldt-card strong" data-testid="banking-categorize-box"', 'className="p-1" data-testid="banking-categorize-box"'), css],
    ["right box loses the dark outline", view.replace('className="ldt-card strong" data-testid="banking-match-candidates-box"', 'className="border-l" data-testid="banking-match-candidates-box"'), css],
    ["a header band is dropped", view.replace('<div className="ldt-ch">\n            <span>Match candidates</span>', '<div>\n            <span>Match candidates</span>'), css],
    ["Type before Date", view.replace("<span>Date</span>\n                  <span>Type</span>", "<span>Type</span>\n                  <span>Date</span>"), css],
    ["Payee column dropped", view.replace("<span>Payee</span>\n", ""), css],
    ["register removed", view.replace('className="ldt-rows ldt-rows-match"', 'className="space-y-1.5"'), css],
    ["row testid removed", view.replace('data-testid="banking-match-candidate-row"', ""), css],
    ["best class removed", view.replace('className={`ldt-row${candidate.auto_match ? " best" : ""}`}', 'className="ldt-row"'), css],
    ["invisible divider returns", view.replace('className={`ldt-row${candidate.auto_match ? " best" : ""}`}', 'className="rounded-sm border border-gray-100"'), css],
    ["tokens: strong outline dropped", view, css.replace(".ldt-card.strong { border-color: var(--ldt-ink2); }", "")],
    ["tokens: row rule dropped", view, css.replace("border-bottom: 1px solid var(--ldt-rule); }\n.ldt-rows-match .ldt-row:last-child", "}\n.ldt-rows-match .ldt-row:last-child")],
  ];
  let caught = 0;
  for (const [name, v, c] of mutants) {
    if (v === view && c === css) { console.error(`  ✗ ${name}: mutant did not change the source`); continue; }
    if (problemsFor(v, c).length) caught += 1; else console.error(`  ✗ ${name}: NOT caught`);
  }
  if (caught !== mutants.length) { console.error(`FAIL ${LABEL} SELFTEST — ${caught}/${mutants.length}`); process.exit(1); }
  console.log(`PASS ${LABEL} SELFTEST — ${caught}/${mutants.length} defects caught`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = problemsFor(fs.readFileSync(VIEW, "utf8"), fs.readFileSync(CSS, "utf8"));
  if (problems.length) { console.error(`FAIL ${LABEL}:`); for (const p of problems) console.error(`  - ${p}`); process.exit(1); }
  console.log(`PASS ${LABEL} — two .ldt-card.strong boxes, .ldt-ch bands, candidate register Date · Type · Ref no. · Payee · Description · Open balance · Amount · Gap`);
}
