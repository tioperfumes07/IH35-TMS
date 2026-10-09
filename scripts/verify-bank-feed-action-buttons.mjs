#!/usr/bin/env node
/**
 * BANK-BUTTON-FEEL (owner 2026-10-09) — bank feed row actions (Add / Match / Undo) and the match
 * candidate confirm must be the shared <Button> filled box, never ActionButton text-link chrome.
 *
 *   node scripts/verify-bank-feed-action-buttons.mjs
 *   node scripts/verify-bank-feed-action-buttons.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-bank-feed-action-buttons";

const VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const BUTTON = "apps/frontend/src/components/Button.tsx";

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function collectProblems(sources = { view: read(VIEW), button: read(BUTTON) }) {
  const problems = [];
  const view = stripComments(sources.view);
  const button = sources.button;

  if (!button.includes("bg-[#14314F]") || !button.includes("cursor-pointer") || !button.includes("focus-visible:ring-2")) {
    problems.push(`${BUTTON}: shared Button must keep actionNavy fill + cursor-pointer + focus-visible ring`);
  }

  if (/from\s+["'].*ActionButton["']/.test(view) || /import\s+\{\s*ActionButton\s*\}/.test(view)) {
    problems.push(`${VIEW}: must not import ActionButton — row actions use shared Button`);
  }

  if (/<ActionButton[\s\S]{0,120}banking-action-primary-/.test(view) || /banking-action-primary-[\s\S]{0,120}<\/ActionButton>/.test(view)) {
    problems.push(`${VIEW}: banking-action-primary must not be ActionButton`);
  }
  if (/<ActionButton[\s\S]{0,120}banking-undo-/.test(view) || /banking-undo-[\s\S]{0,80}<\/ActionButton>/.test(view)) {
    problems.push(`${VIEW}: banking-undo must not be ActionButton`);
  }

  if (!/data-testid=\{`banking-action-primary-\$\{tx\.id\}`\}/.test(view) && !/data-testid=\{`banking-action-primary-/.test(view)) {
    problems.push(`${VIEW}: missing banking-action-primary test id`);
  } else if (!/<Button[\s\S]{0,400}banking-action-primary-/.test(view) && !/banking-action-primary-[\s\S]{0,200}<\/Button>/.test(view)) {
    // Prefer attribute near Button open tag (variant/primary before or after testid).
    const primaryWin = view.slice(
      Math.max(0, view.indexOf("banking-action-primary-") - 280),
      view.indexOf("banking-action-primary-") + 120,
    );
    if (!/<Button\b/.test(primaryWin) && !/variant="primary"/.test(primaryWin)) {
      problems.push(`${VIEW}: banking-action-primary must be <Button variant="primary">`);
    }
  }

  const undoWin = view.slice(Math.max(0, view.indexOf("banking-undo-") - 280), view.indexOf("banking-undo-") + 80);
  if (view.includes("banking-undo-") && !/<Button\b/.test(undoWin) && !/variant="secondary"/.test(undoWin)) {
    problems.push(`${VIEW}: banking-undo must be <Button variant="secondary">`);
  }

  const confirmWin = view.slice(
    Math.max(0, view.indexOf('data-testid="banking-match-candidate-confirm"') - 200),
    view.indexOf('data-testid="banking-match-candidate-confirm"') + 80,
  );
  if (!view.includes('data-testid="banking-match-candidate-confirm"')) {
    problems.push(`${VIEW}: missing banking-match-candidate-confirm`);
  } else if (!/<Button\b/.test(confirmWin)) {
    problems.push(`${VIEW}: banking-match-candidate-confirm must be shared <Button>, not a hand-rolled <button>`);
  }

  return problems;
}

if (SELFTEST) {
  const real = { view: read(VIEW), button: read(BUTTON) };
  const broken = {
    view: real.view
      .replace(/import \{ Button \} from "\.\.\/\.\.\/\.\.\/components\/Button";/, 'import { Button } from "../../../components/Button";\nimport { ActionButton } from "../../../components/shared/ActionButton";')
      .replace(
        /<Button[\s\S]*?data-testid=\{`banking-action-primary-\$\{tx\.id\}`\}[\s\S]*?<\/Button>/,
        '<ActionButton data-testid={`banking-action-primary-${tx.id}`}>Add</ActionButton>',
      ),
    button: real.button.replace(/cursor-pointer/, ""),
  };
  const caught = collectProblems(broken);
  if (!caught.some((p) => /ActionButton|cursor-pointer|actionNavy|Button/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — regression not caught`, caught);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL on real sources:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — bank feed Add/Match/Undo + match confirm use shared Button (not ActionButton)`);
