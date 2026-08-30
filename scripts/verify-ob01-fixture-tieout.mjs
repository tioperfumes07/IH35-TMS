#!/usr/bin/env node
/** @ratchet — frozen historical fixture versus embedded owner acceptance; never current Live proof. */
/**
 * OB-01 — the clone-as-is fixture (docs/fixtures/ob01/transp-2026-03-31.json) actually re-sums to the
 * owner's acceptance totals.
 *
 * Owner ruling 2026-07-29 (Cursor-OpeningBalances-OB01.md): auto-IMPORT + COMMIT the TRANSP QBO
 * snapshot AS-OF 03/31/2026 clone-as-is NOW. The fixture this migration/service reads from is the
 * single source of truth for that clone-as-is population — if it silently drifted (a bad transcription
 * from Cursor-Balances-Reference.xlsx, a rounding error, a dropped line), the books would be seeded
 * wrong and every downstream report would inherit it.
 *
 * This guard is deliberately independent of, and does not duplicate, the lighter existence-only
 * fixture check in verify-ob01-opening-balance-register.mjs (step 1734): THIS file re-derives the
 * three totals from the fixture's OWN `lines` array (never trusts the `acceptance_totals_cents`
 * object at face value) and only then compares both the re-derived sums AND the declared object
 * against the owner's numbers. A guard that only checked the declared object against itself would be
 * a guard that could never fail on a bad fixture — the exact "checks nothing" defect Rule 16 forbids.
 *
 *   Assets:      -834,113,738 cents
 *   Liabilities:  133,235,669 cents
 *   Equity:      -967,349,407 cents
 *   Balance check (A - (L + E)): 0
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FIXTURE_JSON = "docs/fixtures/ob01/transp-2026-03-31.json";

export const ACCEPTANCE_TOTALS_CENTS = Object.freeze({
  assets: -834113738,
  liabilities: 133235669,
  equity: -967349407,
});

const VALID_ACCOUNT_TYPES = new Set(["Asset", "Liability", "Equity"]);

/** Re-derive assets/liabilities/equity sums directly from the fixture's own line array. */
export function sumFixtureLines(lines) {
  const sums = { Asset: 0, Liability: 0, Equity: 0 };
  const problems = [];
  if (!Array.isArray(lines) || lines.length === 0) {
    problems.push("fixture has no lines array to sum");
    return { sums, problems };
  }
  for (const [i, line] of lines.entries()) {
    if (typeof line.qbo_snapshot_cents !== "number" || !Number.isInteger(line.qbo_snapshot_cents)) {
      problems.push(`line ${i} (${line.qbo_account_name ?? "?"}) has a non-integer qbo_snapshot_cents`);
      continue;
    }
    if (!VALID_ACCOUNT_TYPES.has(line.account_type)) {
      problems.push(`line ${i} (${line.qbo_account_name ?? "?"}) has account_type "${line.account_type}", expected Asset/Liability/Equity`);
      continue;
    }
    sums[line.account_type] += line.qbo_snapshot_cents;
  }
  return { sums, problems };
}

export function checkFixtureTieout(json) {
  const problems = [];
  if (!json) {
    problems.push(`${FIXTURE_JSON} is missing or not valid JSON`);
    return problems;
  }
  if (json.company_code !== "TRANSP") {
    problems.push(`fixture company_code is "${json.company_code}", expected TRANSP`);
  }
  if (json.as_of_date !== "2026-03-31") {
    problems.push(`fixture as_of_date is "${json.as_of_date}", expected 2026-03-31`);
  }

  const { sums, problems: sumProblems } = sumFixtureLines(json.lines);
  problems.push(...sumProblems);

  const assets = sums.Asset;
  const liabilities = sums.Liability;
  const equity = sums.Equity;

  // Re-derived-from-lines check — the arithmetic that actually protects against a bad transcription.
  if (assets !== ACCEPTANCE_TOTALS_CENTS.assets) {
    problems.push(`re-summed Asset lines total ${assets}, expected ${ACCEPTANCE_TOTALS_CENTS.assets}`);
  }
  if (liabilities !== ACCEPTANCE_TOTALS_CENTS.liabilities) {
    problems.push(`re-summed Liability lines total ${liabilities}, expected ${ACCEPTANCE_TOTALS_CENTS.liabilities}`);
  }
  if (equity !== ACCEPTANCE_TOTALS_CENTS.equity) {
    problems.push(`re-summed Equity lines total ${equity}, expected ${ACCEPTANCE_TOTALS_CENTS.equity}`);
  }
  if (assets - (liabilities + equity) !== 0) {
    problems.push(
      `re-summed lines do not balance: Assets(${assets}) - (Liabilities(${liabilities}) + Equity(${equity})) = ${assets - (liabilities + equity)}, expected 0`
    );
  }

  // Declared acceptance_totals_cents object — must AGREE with the re-summed numbers, not just exist.
  const declared = json.acceptance_totals_cents;
  if (!declared) {
    problems.push("fixture is missing acceptance_totals_cents");
  } else {
    if (declared.assets !== ACCEPTANCE_TOTALS_CENTS.assets) {
      problems.push(`declared acceptance_totals_cents.assets is ${declared.assets}, expected ${ACCEPTANCE_TOTALS_CENTS.assets}`);
    }
    if (declared.liabilities !== ACCEPTANCE_TOTALS_CENTS.liabilities) {
      problems.push(`declared acceptance_totals_cents.liabilities is ${declared.liabilities}, expected ${ACCEPTANCE_TOTALS_CENTS.liabilities}`);
    }
    if (declared.equity !== ACCEPTANCE_TOTALS_CENTS.equity) {
      problems.push(`declared acceptance_totals_cents.equity is ${declared.equity}, expected ${ACCEPTANCE_TOTALS_CENTS.equity}`);
    }
    if ((declared.balance_check ?? null) !== 0) {
      problems.push(`declared acceptance_totals_cents.balance_check is ${declared.balance_check}, expected 0`);
    }
    // Declared numbers must also match the RE-SUMMED numbers, not just the constants above — catches a
    // fixture whose declared block was hand-edited to match acceptance while the lines drifted, or vice
    // versa.
    if (declared.assets !== assets) problems.push(`declared assets(${declared.assets}) != re-summed assets(${assets})`);
    if (declared.liabilities !== liabilities) problems.push(`declared liabilities(${declared.liabilities}) != re-summed liabilities(${liabilities})`);
    if (declared.equity !== equity) problems.push(`declared equity(${declared.equity}) != re-summed equity(${equity})`);
  }

  // Structural check on the 2026-07-29 prod-truth matching metadata: an alias/fold declared for a
  // label that isn't even in the fixture's own lines is dead law — it silently stops protecting
  // anything the moment the fixture is regenerated.
  const lineNames = new Set((Array.isArray(json.lines) ? json.lines : []).map((l) => l.qbo_account_name));
  for (const key of Object.keys(json.match_aliases ?? {})) {
    if (!lineNames.has(key)) problems.push(`match_aliases key "${key}" is not a qbo_account_name in fixture lines`);
  }
  for (const [key, target] of Object.entries(json.fold_into ?? {})) {
    if (!lineNames.has(key)) problems.push(`fold_into key "${key}" is not a qbo_account_name in fixture lines`);
    if (typeof target !== "string" || !target.trim()) problems.push(`fold_into["${key}"] must name a non-empty target label`);
  }

  return problems;
}

function readJson(rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/**
 * SELFTEST — must be capable of failing. Plants a corrupted line and a corrupted declared-totals
 * object against the REAL current fixture and proves both are caught.
 */
function selftest() {
  const json = readJson(FIXTURE_JSON);
  if (!json) {
    console.error(`verify-ob01-fixture-tieout SELFTEST FAIL — ${FIXTURE_JSON} is missing; cannot self-test`);
    process.exit(1);
  }

  const cases = [
    { why: "the unmodified fixture passes", run: () => checkFixtureTieout(json), expectFail: false },
    {
      why: "a line's qbo_snapshot_cents is corrupted by $100 — the re-sum must drift and be caught",
      run: () => {
        const lines = json.lines.map((l, i) => (i === 0 ? { ...l, qbo_snapshot_cents: l.qbo_snapshot_cents + 10_000 } : l));
        return checkFixtureTieout({ ...json, lines });
      },
      expectFail: true,
    },
    {
      why: "a line is deleted entirely — the re-sum must drift and be caught",
      run: () => checkFixtureTieout({ ...json, lines: json.lines.slice(1) }),
      expectFail: true,
    },
    {
      why: "the declared acceptance_totals_cents is hand-edited to disagree with the re-summed lines",
      run: () => checkFixtureTieout({ ...json, acceptance_totals_cents: { assets: 1, liabilities: 2, equity: 3, balance_check: 0 } }),
      expectFail: true,
    },
    {
      why: "acceptance_totals_cents is deleted entirely",
      run: () => {
        const { acceptance_totals_cents, ...rest } = json;
        return checkFixtureTieout(rest);
      },
      expectFail: true,
    },
    {
      why: "a line's account_type is corrupted to a non-balance-sheet type — the sum silently drops it",
      run: () => {
        const lines = json.lines.map((l, i) => (i === 0 ? { ...l, account_type: "Expense" } : l));
        return checkFixtureTieout({ ...json, lines });
      },
      expectFail: true,
    },
    {
      why: "the fixture file itself is missing",
      run: () => checkFixtureTieout(null),
      expectFail: true,
    },
    {
      why: "a match_aliases key points at a label that is not in the fixture's own lines",
      run: () => checkFixtureTieout({ ...json, match_aliases: { ...json.match_aliases, "Not A Real Line": "Something" } }),
      expectFail: true,
    },
    {
      why: "a fold_into key points at a label that is not in the fixture's own lines",
      run: () => checkFixtureTieout({ ...json, fold_into: { ...json.fold_into, "Not A Real Line": "Retained Earnings" } }),
      expectFail: true,
    },
  ];

  let failures = 0;
  for (const [i, c] of cases.entries()) {
    const problems = c.run();
    const failed = problems.length > 0;
    if (failed !== c.expectFail) {
      console.error(
        `  selftest case ${i + 1} FAIL — expected fail=${c.expectFail}, got ${failed} (${c.why})` +
          (problems.length ? `\n    ${problems.join("\n    ")}` : "")
      );
      failures += 1;
    } else {
      console.log(`  selftest case ${i + 1} OK — fail=${failed} (${c.why})`);
    }
  }

  if (failures > 0) {
    console.error(`verify-ob01-fixture-tieout SELFTEST FAIL — ${failures} of ${cases.length} cases wrong`);
    process.exit(1);
  }
  console.log(`verify-ob01-fixture-tieout SELFTEST OK — ${cases.length}/${cases.length} cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const json = readJson(FIXTURE_JSON);
  const problems = checkFixtureTieout(json);

  if (problems.length > 0) {
    console.error(`verify-ob01-fixture-tieout FAIL — ${FIXTURE_JSON} does not tie to the owner's acceptance totals.\n`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    `verify-ob01-fixture-tieout OK — ${json.lines.length} lines re-summed to Assets ${ACCEPTANCE_TOTALS_CENTS.assets}, ` +
      `Liabilities ${ACCEPTANCE_TOTALS_CENTS.liabilities}, Equity ${ACCEPTANCE_TOTALS_CENTS.equity} cents; A = L + E (balance check 0)`
  );
}

main();
