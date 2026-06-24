#!/usr/bin/env node
/**
 * verify:money-fields-use-moneyinput  (M-1 recurrence guard)
 *
 * The 350 -> $3.50 class of bug shipped because money was entered through a raw
 * <input> that fed a dollar/cents amount without the shared MoneyInput dollars/cents seam.
 * GUARD's live crawl proved the failure mode: a surface gets its PROMINENT money input converted
 * but an INLINE/secondary money input on the same surface stays raw. This guard is the durable,
 * per-FIELD guarantee: it fails CI if ANY raw money <input> exists in apps/frontend/src.
 *
 * Detection = (numeric-shaped input) AND (money-bound) AND (NOT a non-money decimal).
 *  - numeric-shaped: type="number" OR inputMode="decimal" OR step~0.01
 *  - money-bound: the value=/onChange= binding or placeholder names a dollar/cents amount
 *    (cents, amount, price, cost, premium, demand, settlement, dollars, balance, principal,
 *     linehaul, surcharge, accessorial, claimed, lumper, billPay, payInvoice, rate-per-hour...)
 *  - non-money exclusions: percent, qty/quantity, miles, hours, days, odometer, term, period,
 *    count, weight, installment, lat/lng, year — these legitimately use decimals.
 *
 * Driver-pwa (apps/driver-pwa) is a separate app with its own design system and no MoneyInput;
 * intentionally out of scope.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "apps/frontend/src");
const MONEY_COMPONENT = "MoneyInput.tsx";

// Money-bound = the input's OWN value={...} binding (or a $-placeholder) names a dollar/cents amount.
// Precise on the binding variable to avoid label-context false positives (City/Zip near a "lumper" label).
const MONEY_VALUE_RE =
  /value=\{[^}]*(\w*[Cc]ents\b|\w*Amount\b|\w*[Dd]ollars\b|sellPrice|buyCost|\w*[Pp]rice\b|unitCost|laborCents|partsCents|outsideCents|principal\w*|loanPrincipal\w*|[Pp]remium\b|demand\b|settlement\b|down_payment|total_premium|opening_balance\w*|reconStatementBalance|statementBalance\w*|minBal\w*|minRevenue\w*|amountMin|amountMax|maxPerSettlement\w*|payInvoiceAmount|billPayAmt|billPayAmount|claimedDollars|feeAmount|releaseAmount|soldPrice|detentionRate\w*|default_amount\w*|line\.(debit|credit)|\.debit\b|\.credit\b|item\.amount)/;
const MONEY_PLACEHOLDER_RE = /placeholder=["'][^"']*(\$|USD|cents|[Aa]mount|[Pp]rice|principal|[Cc]ost|premium|balance)/;
// Exclusions — bindings that look money-ish but are not amount-entry, plus non-money decimals.
const EXCLUDE_RE =
  /readOnly|disabled=\{true\}|value=\{[^}]*(Ref\b|Reference|Count\b|Qty|Date|Name\b|Phone|Email|Uuid|Id\b|Number\b|Code\b|description|memo|Pct|percent|Rate\b|rate\b)/;
const NON_MONEY_RE =
  /%|[Pp]ct|percent|per[_ ]?mile|[Qq]ty|quantity|[Mm]iles|\bhours\b|\bdays\b|odometer|term_months|installment|[Ww]eight|latitude|longitude|\blat\b|\blng\b|\byear\b|reorder|on_hand|qty_|placeholder=["']Show /;

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
    // Assemble the full <input ...> tag across lines.
    let tag = lines[i];
    let j = i;
    while (j < lines.length && !/\/>|><\/input>|>\s*$/.test(tag) && j - i < 14) {
      j++;
      tag += "\n" + (lines[j] ?? "");
    }
    // Skip non-text input types that are never money entry.
    const typeMatch = tag.match(/type=["'](\w+)["']/);
    const inputType = typeMatch ? typeMatch[1] : "text";
    if (["date", "time", "datetime-local", "checkbox", "radio", "hidden", "file", "email", "tel", "url", "password", "color", "range", "search", "month", "week"].includes(inputType)) continue;
    if (EXCLUDE_RE.test(tag)) continue; // readOnly / ref / name / date / pct etc.
    // Money-bound = the input's OWN value binding (or a $-placeholder) names a dollar/cents amount.
    const moneyBound = MONEY_VALUE_RE.test(tag) || MONEY_PLACEHOLDER_RE.test(tag);
    if (!moneyBound) continue;
    const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, j + 1)).join("\n");
    if (NON_MONEY_RE.test(tag) || NON_MONEY_RE.test(context)) continue; // non-money decimal/count
    offenders.push({ file: file.replace(process.cwd() + "/", ""), line: i + 1, snippet: lines[i].trim().slice(0, 110) });
  }
}

if (offenders.length > 0) {
  console.error(`verify:money-fields-use-moneyinput FAIL — ${offenders.length} raw money <input>(s) must use MoneyInput:`);
  for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.snippet}`);
  console.error("\nEvery dollar/cents entry field must go through components/forms/MoneyInput:");
  console.error("  dollar-denominated column -> <MoneyInput valueDollars=.. onChangeDollars=..>");
  console.error("  *_cents column            -> <MoneyInput valueCents=.. onChangeCents=..>");
  console.error("If this is a NON-money decimal (percent/miles/hours/qty/weight), it should not match — refine its label/placeholder or extend NON_MONEY_RE.");
  process.exit(1);
}
console.log("verify:money-fields-use-moneyinput PASS — no raw money <input> outside MoneyInput");
