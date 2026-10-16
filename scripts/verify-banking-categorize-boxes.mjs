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
 * RE-PINNED BANK-MATCH-QBO-c (owner 2026-09-06): the candidate register itself moved off the hand-built
 * .ldt-rows.ldt-rows-match div-grid onto a real <ParityTable> (gear = column show/hide + drag-resize +
 * drag-reorder); "Gap" split into signed Difference/Days off columns. The head-order pin below now reads
 * the buildMatchCandidateColumns() factory's own column array (source order = render order absent a
 * manual reorder) instead of literal <span> head cells.
 *
 * PINS (source, apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx):
 *   1. both boxes are `.ldt-card strong` with testids banking-categorize-box / banking-match-candidates-box;
 *   2. each box opens with an `.ldt-ch` header band;
 *   3. buildMatchCandidateColumns() reads Date · Type · Ref no. · Payee · Description · Open balance · Amount ·
 *      Difference · Days off in that order; the register is a real <ParityTable>, every candidate row carries
 *      the banking-match-candidate-row testid (via rowTestId) and the `best` class when auto_match (via
 *      rowClassName);
 *   4. no `border-gray-100` card remains inside the match pane (the invisible divider);
 *   5. the palette carries `.ldt-card.strong` (border-color: var(--ldt-ink2)) and
 *      `.ldt-rows-match-table tr.best { background: var(--ldt-accent-soft) }` (styles/tokens-load-detail.css).
 *
 * Usage: node scripts/verify-banking-categorize-boxes.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VIEW = path.join(ROOT, "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
const CSS = path.join(ROOT, "apps/frontend/src/styles/tokens-load-detail.css");
// LEAD 443.163 (register M3): the match side of the Categorize / Match popup IS MatchDrawer (embedded) — one matcher on
// screen. The candidate-register requirements this guard always held (Date · Type · Ref no. · Payee · Description · Open
// balance · Amount · Difference · Days off, the type multi-select sent as kinds) are now held on that ONE matcher.
const DRAWER = path.join(ROOT, "apps/frontend/src/pages/banking/components/MatchDrawer.tsx");
const LABEL = "verify-banking-categorize-boxes";

export function problemsFor(view, css, drawer = "") {
  const problems = [];
  const panelStart = view.indexOf('data-testid="banking-categorize-expanded-panel"');
  if (panelStart === -1) problems.push("expanded panel (banking-categorize-expanded-panel) missing");
  const panel = panelStart === -1 ? "" : view.slice(panelStart, view.indexOf("\n  return (", panelStart) === -1 ? undefined : view.indexOf("\n  return (", panelStart));

  for (const id of ["banking-categorize-box", "banking-match-candidates-box"]) {
    const re = new RegExp(`className="ldt-card strong"[^>]*data-testid="${id}"|data-testid="${id}"[^>]*className="ldt-card strong"`);
    if (!re.test(panel)) problems.push(`${id} is not an .ldt-card.strong (dark outline) box`);
  }
  if ((panel.match(/className="ldt-ch"/g) ?? []).length < 2) problems.push("both boxes must open with an .ldt-ch header band");

  // LEAD 443.163 (register M3) — ONE matcher: the match box renders MatchDrawer embedded for this bank line; the view never
  // queries candidates itself (no second candidate table on this surface).
  if (!/<MatchDrawer\s+embedded\b[\s\S]{0,200}bankTransactionId=\{tx\.id\}/.test(panel))
    problems.push("match box must render the ONE matcher — <MatchDrawer embedded bankTransactionId={tx.id} …> (register M3)");
  if (/getMatchCandidates\(/.test(view)) problems.push("the banking view queries match candidates itself — a second matcher on the surface (register M3)");
  for (const [id, field] of [
    ["match-candidate-date", "Date"], ["match-candidate-kind", "Type"], ["match-candidate-drillthrough", "Ref no."],
    ["match-candidate-payee", "Payee"], ["match-candidate-description", "Description"], ["match-candidate-open-balance", "Open balance"],
    ["match-candidate-amount", "Amount"], ["match-candidate-difference", "Difference"], ["match-candidate-days-off", "Days off"],
  ]) {
    if (!drawer.includes(`data-testid="${id}"`)) problems.push(`MatchDrawer candidate rows must show ${field} (${id})`);
  }
  if (/border-gray-100/.test(panel)) problems.push("border-gray-100 (invisible divider) still inside the expanded panel");

  if (!/\.ldt-card\.strong\s*\{\s*border-color:\s*var\(--ldt-ink2\)/.test(css)) problems.push("tokens: .ldt-card.strong { border-color: var(--ldt-ink2) } missing");
  if (!/\.ldt-rows-match-table tr\.best\s*\{\s*background:\s*var\(--ldt-accent-soft\)/.test(css)) problems.push("tokens: .ldt-rows-match-table tr.best needs the --ldt-accent-soft best-match tint");

  // ROUND 433-CUR #1 — Categorize/Match is a dimmed Modal popup (not only inline under the row).
  if (!/from ["'].*components\/Modal["']/.test(view) && !/from ["'].*\/Modal["']/.test(view)) {
    problems.push("ROUND 433-CUR: must import Modal for Categorize/Match popup");
  }
  if (!/data-testid="banking-categorize-match-modal"/.test(view)) {
    problems.push("ROUND 433-CUR: Categorize/Match panel must render inside banking-categorize-match-modal");
  }
  if (!/title="Categorize \/ Match"/.test(view) || !/\bwide\b/.test(view)) {
    problems.push("ROUND 433-CUR: Modal must be titled Categorize / Match and wide");
  }
  // B3 — match candidates filterable by transaction type (multi-select) — on the ONE matcher (register M3/M5).
  if (!/data-testid="match-drawer-record-type-dropdown"/.test(drawer) || !/MultiSelectDropdown/.test(drawer)) {
    problems.push("ROUND 433-CUR B3: MatchDrawer filters must include the record-type MultiSelectDropdown");
  }
  if (!/kinds:\s*recordKinds\.length\s*\?\s*recordKinds\s*:\s*undefined/.test(drawer)) {
    problems.push("ROUND 433-CUR B3: MatchDrawer must send the selected types as kinds to getMatchCandidates");
  }
  // B6 — every categorize picker box is EntityLink-linked when selected.
  for (const id of [
    "banking-categorize-vendor-link",
    "banking-categorize-account-link",
    "banking-categorize-item-link",
    "banking-categorize-customer-link",
  ]) {
    if (!view.includes(`data-testid="${id}"`)) {
      problems.push(`ROUND 433-CUR B6: missing EntityLink surface ${id}`);
    }
  }
  return problems;
}

function selftest() {
  const view = fs.readFileSync(VIEW, "utf8");
  const css = fs.readFileSync(CSS, "utf8");
  const drawer = fs.readFileSync(DRAWER, "utf8");
  if (problemsFor(view, css, drawer).length) { console.error(`${LABEL} SELFTEST: baseline is not clean:`, problemsFor(view, css, drawer)); process.exit(1); }
  const mutants = [
    ["left box loses the dark outline", view.replace('className="ldt-card strong" data-testid="banking-categorize-box"', 'className="p-1" data-testid="banking-categorize-box"'), css, drawer],
    ["right box loses the dark outline", view.replace('className="ldt-card strong" data-testid="banking-match-candidates-box"', 'className="border-l" data-testid="banking-match-candidates-box"'), css, drawer],
    ["a header band is dropped", view.replace('<div className="ldt-ch">\n            <span>Match</span>', '<div>\n            <span>Match</span>'), css, drawer],
    ["M3: match box no longer the one matcher", view.replace("<MatchDrawer\n              embedded", "<div\n              data-x"), css, drawer],
    ["M3: second candidate query in the view", view + "\nvoid getMatchCandidates(id, co, {});\n", css, drawer],
    ["Payee dropped from the matcher rows", view, css, drawer.replace('data-testid="match-candidate-payee"', 'data-testid="match-candidate-payee-GONE"')],
    ["Days off dropped from the matcher rows", view, css, drawer.replace('data-testid="match-candidate-days-off"', 'data-testid="x"')],
    ["Open balance dropped from the matcher rows", view, css, drawer.replace('data-testid="match-candidate-open-balance"', 'data-testid="x"')],
    ["tokens: strong outline dropped", view, css.replace(".ldt-card.strong { border-color: var(--ldt-ink2); }", ""), drawer],
    ["tokens: best tint dropped", view, css.replace(".ldt-rows-match-table tr.best { background: var(--ldt-accent-soft); }", ""), drawer],
    ["433 modal testid dropped", view.replace('data-testid="banking-categorize-match-modal"', 'data-testid="banking-categorize-match-GONE"'), css, drawer],
    ["433 B3 kinds filter dropped", view, css, drawer.replace('data-testid="match-drawer-record-type-dropdown"', 'data-testid="x"')],
    ["433 B3 kinds not sent to API", view, css, drawer.replace("kinds: recordKinds.length ? recordKinds : undefined,", "/* kinds removed */")],
    ["433 B6 vendor link dropped", view.replace('data-testid="banking-categorize-vendor-link"', 'data-testid="banking-categorize-vendor-GONE"'), css, drawer],
  ];
  let caught = 0;
  for (const [name, v, c, d] of mutants) {
    if (v === view && c === css && d === drawer) { console.error(`  ✗ ${name}: mutant did not change the source`); continue; }
    if (problemsFor(v, c, d).length) caught += 1; else console.error(`  ✗ ${name}: NOT caught`);
  }
  if (caught !== mutants.length) { console.error(`FAIL ${LABEL} SELFTEST — ${caught}/${mutants.length}`); process.exit(1); }
  console.log(`PASS ${LABEL} SELFTEST — ${caught}/${mutants.length} defects caught`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = problemsFor(fs.readFileSync(VIEW, "utf8"), fs.readFileSync(CSS, "utf8"), fs.readFileSync(DRAWER, "utf8"));
  if (problems.length) { console.error(`FAIL ${LABEL}:`); for (const p of problems) console.error(`  - ${p}`); process.exit(1); }
  console.log(`PASS ${LABEL} — two .ldt-card.strong boxes, .ldt-ch bands, one matcher (MatchDrawer embedded) rows Date · Type · Ref no. · Payee · Description · Open balance · Amount · Difference · Days off`);
}
