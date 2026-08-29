#!/usr/bin/env node
/**
 * GUARD — verify-cents-dollar-scale (CLS-UNIT-SCALE)
 *
 * THE DEFECT CLASS
 * A cents integer is handed to a surface whose contract is DOLLARS. Nothing throws, nothing logs — the
 * number is simply 100x wrong on screen. Live-confirmed on prod: Banking Home showed **$9,368.00**
 * where the correct cash figure was **$93.68**.
 *
 * The specific shape this catches is a SQL projection that aliases a `*_amount_cents` / `amount_cents`
 * column to the bare output name `amount` (or `balance`, `total`) with no `/ 100`. Those output names
 * are the register/suggestion contract, and that contract is dollars — proven inside this very file,
 * where the escrow and advance_pool branches write `(el.amount_cents::numeric / 100) AS amount` and
 * `bt.amount_cents::numeric / 100`. Two sibling branches did the conversion and two did not; the two
 * that did not shipped the 100x bug.
 *
 * WHY NOT A BLANKET "no amount_cents in SQL" RULE
 * `amount_cents` belongs in SQL constantly — in WHERE clauses, in tolerance comparisons, in SUMs that
 * stay in cents. The suggestions query legitimately compares `abs(amount_cents - $2) <= 500` (a 500-CENT
 * tolerance) two lines below the projection this guard fixes. A blanket ban would force that comparison
 * into dollars and introduce float error into a money predicate. So the assertion is narrow on purpose:
 * only the ALIAS-TO-DOLLAR-NAME projection is forbidden.
 *
 * METHOD: SQL is read from the template literals; comments are stripped first so the prose above and
 * the in-file explanations cannot satisfy or trip the check. --selftest mutates the REAL source and
 * requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-cents-dollar-scale";
const FILES = ["apps/backend/src/banking/banking.routes.ts"];

/** Output aliases whose consumer contract is DOLLARS. */
const DOLLAR_ALIASES = ["amount", "balance", "total", "deposits", "withdrawals"];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

function check(sources) {
  const errors = [];
  for (const [file, raw] of Object.entries(sources)) {
    const src = stripComments(raw);

    for (const alias of DOLLAR_ALIASES) {
      // `<something>amount_cents AS amount` with no division anywhere in the projection expression.
      const re = new RegExp(`(^|[\\s,(])([A-Za-z_][\\w.]*_cents)\\s+AS\\s+${alias}\\b`, "gim");
      let m;
      while ((m = re.exec(src)) !== null) {
        errors.push(
          `${file}: projects \`${m[2]} AS ${alias}\` — a CENTS column aliased to \`${alias}\`, whose ` +
            `consumer contract is DOLLARS. This renders 100x too large (prod showed $9,368.00 for a ` +
            `true $93.68). Use \`(${m[2]}::numeric / 100) AS ${alias}\`, as the sibling branches do. ` +
            `Keep cents in WHERE/tolerance comparisons — only the projected value is scaled.`
        );
      }
    }
  }
  return errors;
}

function loadAll() {
  const out = {};
  for (const f of FILES) out[f] = readFileSync(f, "utf8");
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const target = FILES[0];

  const mutations = [
    [
      "UNIT-002 factoring register reverts to raw cents",
      (s) => ({
        ...s,
        [target]: s[target].replace(
          "(fa.advance_amount_cents::numeric / 100) AS amount",
          "fa.advance_amount_cents AS amount"
        ),
      }),
    ],
    [
      "UNIT-003 suggestions reverts to raw cents",
      (s) => ({
        ...s,
        [target]: s[target].replace("(amount_cents::numeric / 100) AS amount", "amount_cents AS amount"),
      }),
    ],
    [
      "escrow branch loses its conversion",
      (s) => ({
        ...s,
        // ACCT-F5703 repointed this branch from driver_finance.escrow_ledger (alias `el`) onto
        // accounting.escrow_postings (alias `ep`) — the mutation string must track the live alias
        // or it silently stops changing anything (that's exactly what went stale here).
        [target]: s[target].replace("(ep.amount_cents::numeric / 100) AS amount", "ep.amount_cents AS amount"),
      }),
    ],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (JSON.stringify(broken) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} cents/dollars scale defect(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — no cents column is projected under a dollar-contract alias.`);
