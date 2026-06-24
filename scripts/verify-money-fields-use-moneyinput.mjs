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
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "apps/frontend/src");
const MONEY_COMPONENT = "MoneyInput.tsx";

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
  /%|[Pp]ct|percent|per[_ ]?mile|[Qq]ty|quantity|[Mm]iles|\bhours\b|\bdays\b|odometer|term_months|installment|[Ww]eight|latitude|longitude|\blat\b|\blng\b|\byear\b|reorder|on_hand|qty_/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) && name !== MONEY_COMPONENT) out.push(p);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
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
    offenders.push({ file: file.replace(process.cwd() + "/", ""), line: i + 1, snippet: lines[i].trim().slice(0, 110) });
  }
}

if (offenders.length > 0) {
  console.error(`verify:money-fields-use-moneyinput FAIL — ${offenders.length} raw money <input>(s) must use MoneyInput:`);
  for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.snippet}`);
  console.error("\nEvery dollar/cents entry field (modal OR inline-create row) must go through components/forms/MoneyInput:");
  console.error("  dollar-denominated column -> <MoneyInput valueDollars=.. onChangeDollars=..>");
  console.error("  *_cents column            -> <MoneyInput valueCents=.. onChangeCents=..>");
  console.error("Detection keys on the value BINDING (not placeholder) so a misleading placeholder can't hide a money field.");
  process.exit(1);
}
console.log("verify:money-fields-use-moneyinput PASS — no raw money <input> outside MoneyInput (modal + inline)");
