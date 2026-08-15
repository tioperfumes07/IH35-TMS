#!/usr/bin/env node
/**
 * verify:money-fields-use-moneyinput  (M-1 recurrence guard — the durable per-FIELD guarantee)
 *
 * The 350 -> $3.50 class shipped because money was entered through a raw <input> that fed a
 * dollar/cents amount without the shared MoneyInput dollars/cents seam. GUARD's live crawl proved the
 * exact failure mode FOUR times: the prominent/MODAL money input on a surface gets converted, but an
 * INLINE-create-row money input on the SAME surface is missed (Manual JE lines, Factoring inline
 * principal, Internal Fines inline). This guard enumerates EVERY raw money <input> — modal AND inline,
 * numeric-typed AND plain-text — so no money field can regress.
 *
 * Offender = an <input> that is (a) money-BOUND on its OWN value={...} binding (or a $/cents
 * placeholder) and (b) not readOnly/ref/date/percent/qty. Numeric shape is NOT required — the
 * Factoring "principal cents" and Internal Fines inline fields were plain text inputs.
 *
 * Driver-pwa (apps/driver-pwa) is a separate app with its own design system and no MoneyInput —
 * intentionally out of scope.
 *
 * NOTE: a misleading placeholder must NOT cause a false-NEGATIVE. The Internal Fines amount had
 * placeholder "Show 25" yet was the fine amount — so detection keys on the value BINDING, never the
 * placeholder text, for the money signal.
 *
 * ACCT-F5314 (2026-08-15): a SECOND, distinct false-negative class — a generic per-page `field(label,
 * key, type)` helper (LoanWizardPage, CalculatorPage, AmortizationPage) renders `value={form[key]}`.
 * The scanner above is binding-based and `form[key]` is a runtime lookup, not a `*Cents`/`Amount`/
 * `*Price`-shaped literal — so the money signal invisible to MONEY_VALUE_RE, no matter how the field
 * was rendered. All seven affected dollar fields (Purchase price/Down payment/Loan amount/Salvage
 * value on the Loan Wizard, Price/Down payment on the Calculator, Principal on Amortization) DID carry
 * a visible signal, just not on the `<input>` tag: their call-site LABEL literally says "($)". This
 * second pass catches that shape product-wide — any `field("...($)...", ...)` (or a bare "$" in the
 * label) call that is not the money-safe `moneyField(...)` helper — so a future page cannot reintroduce
 * the exact same helper-hides-the-binding bug under a new file name.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "apps/frontend/src");
const MONEY_COMPONENT = "MoneyInput.tsx";

// ALLOWLIST — money inputs intentionally NOT yet converted, each with a tracked reason. Keep this EMPTY
// except for genuinely-blocked fields; every entry is debt to remove.
//   EscrowForfeitModal: the backend route is now BUILT (SAF-F01: escrow-forfeit.routes.ts, mounted). Its
//   Zod contract is decided — amount is DOLLARS (service converts ×100). The remaining debt is purely the
//   FRONTEND widget: converting the modal's raw amount input to MoneyInput (+ ParityDrawer + a real
//   liability picker) is SAF-F10, a separate tracked frontend finding. Kept here ONLY until SAF-F10 lands;
//   at that point remove this entry. Not converting the widget inside the backend HOLD PR keeps scope honest
//   (a half-converted modal on an inferred binding is the PartsMasterData trap).
const ALLOWLIST = new Set([
  "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx",
]);

// Money-bound = the input's OWN value={...} binding names a dollar/cents amount. Binding-based so a
// misleading placeholder (e.g. "Show 25" on a fine amount) cannot hide a real money field.
const MONEY_VALUE_RE =
  /value=\{[^}]*(\w*[Cc]ents\b|\w*Amount\b|amount\b|\w*[Dd]ollars\b|sellPrice|buyCost|\w*[Pp]rice\b|unitCost|laborCents|partsCents|outsideCents|principal\w*|loanPrincipal\w*|[Pp]remium\b|demand\b|settlement\b|down_payment|total_premium|opening_balance\w*|reconStatementBalance|statementBalance\w*|minBal\w*|minRevenue\w*|amountMin|amountMax|maxPerSettlement\w*|payInvoiceAmount|billPayAmt|billPayAmount|claimedDollars|feeAmount|releaseAmount|soldPrice|detentionRate\w*|default_amount\w*|disputeAmount|resolutionAmount|line\.(debit|credit)|\.debit\b|\.credit\b|item\.amount)/;
// A $-placeholder is an ADDITIONAL positive signal (never used to exclude).
const MONEY_PLACEHOLDER_RE = /placeholder=["'][^"']*(\$|USD|principal cents|amount cents)/i;
// Exclude: not amount-entry (refs/names/dates/codes), or genuinely non-money decimals.
const EXCLUDE_RE =
  /readOnly|value=\{[^}]*(Ref\b|Reference|Date\b|Name\b|Phone|Email|Uuid|\bId\b|Number\b|Code\b|description|memo|Pct\b|percent)/;
const NON_MONEY_RE =
  /%|[Pp]ct|percent|per[_ ]?mile|[Qq]ty|quantity|[Mm]iles|\bhours\b|\bdays\b|odometer|term_months|installment|[Ww]eight|latitude|longitude|\blat\b|\blng\b|\byear\b|reorder|on_hand|qty_|step=["']?0?\.000/;
// step="0.0001"/"0.000.." = a sub-cent RATE (e.g. driver per-mile pay rate, 4-decimal), NOT a $#,##0.00
// money amount — MoneyInput's 2-decimal format would TRUNCATE it. Excluded above via step=0.000.

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) && name !== MONEY_COMPONENT) out.push(p);
  }
  return out;
}

export function findRawInputOffenders(files, readFile = readFileSync) {
  const offenders = [];
  for (const file of files) {
    const src = readFile(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/<input\b/.test(lines[i])) continue;
      let tag = lines[i];
      let j = i;
      while (j < lines.length && !/\/>|><\/input>|>\s*$/.test(tag) && j - i < 14) {
        j++;
        tag += "\n" + (lines[j] ?? "");
      }
      const typeMatch = tag.match(/type=["'](\w+)["']/);
      const inputType = typeMatch ? typeMatch[1] : "text";
      if (["date", "time", "datetime-local", "checkbox", "radio", "hidden", "file", "email", "tel", "url", "password", "color", "range", "search", "month", "week"].includes(inputType)) continue;
      if (EXCLUDE_RE.test(tag)) continue;
      const moneyBound = MONEY_VALUE_RE.test(tag) || MONEY_PLACEHOLDER_RE.test(tag);
      if (!moneyBound) continue;
      if (NON_MONEY_RE.test(tag)) continue;
      const rel = file.replace(process.cwd() + "/", "");
      if (ALLOWLIST.has(rel)) continue; // tracked, intentionally-deferred (see ALLOWLIST notes)
      offenders.push({ file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 110) });
    }
  }
  return offenders;
}

// ACCT-F5314 — a generic `field(label, key, type)` helper call whose LABEL literally says it is a
// dollar amount ("($)" or a bare "$"), but whose call name is not the money-safe `moneyField(`. The
// negative lookbehind requires the call name to be exactly `field(`, not a suffix like `moneyField(`.
const HELPER_DOLLAR_FIELD_RE = /(?<![A-Za-z])field\(\s*(["'])((?:(?!\1).)*\$[^"']*)\1/g;

export function findHelperGeneratedDollarFieldOffenders(files, readFile = readFileSync) {
  const offenders = [];
  for (const file of files) {
    const src = readFile(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      HELPER_DOLLAR_FIELD_RE.lastIndex = 0;
      const match = HELPER_DOLLAR_FIELD_RE.exec(lines[i]);
      if (!match) continue;
      const rel = file.replace(process.cwd() + "/", "");
      if (ALLOWLIST.has(rel)) continue;
      offenders.push({ file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 110) });
    }
  }
  return offenders;
}

function selftest() {
  const fixtures = {
    "apps/frontend/src/pages/example/GoodPage.tsx": `
      const moneyField = (label, key) => <MoneyInput valueDollars={form[key]} ariaLabel={label} />;
      {moneyField("Purchase price ($)", "purchasePrice")}
      {field("Term (months)", "termMonths", "number")}
    `,
    "apps/frontend/src/pages/example/BadRawInputPage.tsx": `
      <input value={amountCents} onChange={set("amountCents")} />
    `,
    "apps/frontend/src/pages/example/BadHelperPage.tsx": `
      {field("Purchase price ($)", "purchasePrice", "number")}
    `,
  };
  const files = Object.keys(fixtures);
  const readFile = (f) => fixtures[f];

  const rawGood = findRawInputOffenders(files, readFile);
  if (rawGood.length !== 1 || !rawGood[0].file.endsWith("BadRawInputPage.tsx")) {
    console.error("verify:money-fields-use-moneyinput SELFTEST FAIL — raw <input> detector mismatch");
    process.exit(1);
  }
  const helperGood = findHelperGeneratedDollarFieldOffenders(files, readFile);
  if (helperGood.length !== 1 || !helperGood[0].file.endsWith("BadHelperPage.tsx")) {
    console.error("verify:money-fields-use-moneyinput SELFTEST FAIL — helper-field detector mismatch (good/bad fixtures)");
    process.exit(1);
  }

  // Mutation-prove each of the 7 real dollar consumers this finding fixed: taking the ACTUAL current
  // source of the 3 finance pages and reverting exactly one moneyField(...) call back to the old
  // field(...,"number") shape must be caught, independently, for every field.
  const REAL_FILES = [
    "apps/frontend/src/pages/finance/LoanWizardPage.tsx",
    "apps/frontend/src/pages/finance/CalculatorPage.tsx",
    "apps/frontend/src/pages/finance/AmortizationPage.tsx",
  ].map((rel) => join(process.cwd(), rel));
  const MUTATIONS = [
    { file: REAL_FILES[0], from: 'moneyField("Purchase price ($)", "purchasePrice")', to: 'field("Purchase price ($)", "purchasePrice", "number")' },
    { file: REAL_FILES[0], from: 'moneyField("Down payment ($)", "downPayment")', to: 'field("Down payment ($)", "downPayment", "number")' },
    { file: REAL_FILES[0], from: 'moneyField("Loan amount ($)", "loanAmount")', to: 'field("Loan amount ($)", "loanAmount", "number")' },
    { file: REAL_FILES[0], from: 'moneyField("Salvage value ($)", "salvageValue")', to: 'field("Salvage value ($)", "salvageValue", "number")' },
    { file: REAL_FILES[1], from: 'moneyField("Price ($)", "price")', to: 'field("Price ($)", "price", "number")' },
    { file: REAL_FILES[1], from: 'moneyField("Down payment ($)", "down")', to: 'field("Down payment ($)", "down", "number")' },
    { file: REAL_FILES[2], from: 'moneyField("Principal ($)", "principal")', to: 'field("Principal ($)", "principal", "number")' },
  ];
  for (const [i, mutation] of MUTATIONS.entries()) {
    const realSrc = readFileSync(mutation.file, "utf8");
    if (!realSrc.includes(mutation.from)) {
      console.error(`verify:money-fields-use-moneyinput SELFTEST FAIL — mutation ${i} anchor not found in ${mutation.file}: ${mutation.from}`);
      process.exit(1);
    }
    const mutatedSrc = realSrc.replace(mutation.from, mutation.to);
    const mutatedRead = (f) => (f === mutation.file ? mutatedSrc : readFileSync(f, "utf8"));
    const found = findHelperGeneratedDollarFieldOffenders([mutation.file], mutatedRead);
    if (found.length === 0) {
      console.error(`verify:money-fields-use-moneyinput SELFTEST FAIL — mutation ${i} escaped detection: ${mutation.file} (${mutation.from})`);
      process.exit(1);
    }
  }
  console.log(`verify:money-fields-use-moneyinput SELFTEST PASS — raw-input + helper-field detectors correct; ${MUTATIONS.length}/7 real dollar-field mutations independently caught`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const files = walk(ROOT);
const offenders = [
  ...findRawInputOffenders(files),
  ...findHelperGeneratedDollarFieldOffenders(files),
];

if (offenders.length > 0) {
  console.error(`verify:money-fields-use-moneyinput FAIL — ${offenders.length} money field(s) must use MoneyInput:`);
  for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.snippet}`);
  console.error("\nEvery dollar/cents entry field (modal OR inline-create row) must go through components/forms/MoneyInput:");
  console.error("  dollar-denominated column -> <MoneyInput valueDollars=.. onChangeDollars=..>");
  console.error("  *_cents column            -> <MoneyInput valueCents=.. onChangeCents=..>");
  console.error("Detection keys on the value BINDING (not placeholder) so a misleading placeholder can't hide a money field.");
  console.error("A generic field(label, key, type) helper whose label says \"($)\" must route through a MoneyInput-backed moneyField(...) helper instead.");
  process.exit(1);
}
console.log("verify:money-fields-use-moneyinput PASS — no raw money <input> outside MoneyInput (modal + inline)");
