#!/usr/bin/env node
/**
 * verify-no-native-datetime-input.mjs — C3 (DATE: replace native date inputs with the shared picker).
 *
 * TWO defect classes, both of which the pre-existing date guards structurally CANNOT see:
 *
 *  (1) NATIVE DATETIME INPUT — `<input type="datetime-local">`.
 *      `scripts/verify-no-raw-date-input.mjs` (verify-step 107) covers `type="date"` and passes
 *      clean, but it explicitly EXEMPTS `datetime-local`: "no DatePicker time-of-day equivalent
 *      exists yet" (see its selftest case `datetime-local → NOT flagged`). That exemption was a
 *      placeholder for missing infrastructure, not a decision that the native control is correct.
 *      C3 builds the missing infrastructure (components/forms/DateTimePicker.tsx), so the exemption
 *      is retired here. The native control is locale-dependent (a Mexican-locale browser renders
 *      DD/MM/YYYY on a Laredo↔MX operation), unstyled against the QBO-parity grammar, and has no
 *      shared min/max or empty-state behaviour.
 *
 *  (2) BARE ISO DATE FIELD IN JSX TEXT — `<span>{row.transaction_date}</span>`.
 *      `scripts/verify-no-iso-date-display.mjs` catches three ISO-leak shapes — an ISO
 *      `placeholder=`, a `{expr.slice(0, 10)}` text node, and a hardcoded `>2026-07-03<` literal —
 *      but its own header does not claim, and its regexes cannot see, the most common shape: a
 *      date-typed field rendered bare into a JSX text node. The API serves those columns as ISO
 *      "YYYY-MM-DD" (or a full ISO timestamp), so they reach the operator as ISO. On a bank
 *      reconciliation or an invoice register that is the exact audit/compliance failure
 *      lib/formatDate.ts was created to prevent.
 *
 * WHY A SEPARATE GUARD AND NOT AN EDIT TO 107: 107's `datetime-local → NOT flagged` selftest case
 * is a deliberate, documented exemption. Deleting an assertion from another sweep's guard to make
 * room for this one is the "weaken a guard" anti-pattern even when the intent is to tighten. This
 * guard is purely ADDITIVE: 107 keeps asserting everything it asserts today, and 1553 ratchets the
 * two shapes 107 and no-iso-date-display leave uncovered.
 *
 * Reports file:LINE so the failing output IS the migration worklist.
 *
 * Usage:
 *   node scripts/verify-no-native-datetime-input.mjs            # CI gate
 *   node scripts/verify-no-native-datetime-input.mjs --selftest # plant defects, prove each is caught
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// SCOPE: the office frontend only — the surfaces C3 names (border-crossing, tasks, admin,
// daily-tasks, legal, audit, safety HOS/events, accounting FactoringDetail) all live here, and this
// is the app that owns components/forms/DateTimePicker.tsx.
//
// apps/driver-pwa is deliberately NOT scanned, with a stated reason (never "it was failing"):
// it is an installed touch PWA on a driver's phone, where the native OS date/time wheel is the
// correct control — it is the platform picker, it is localised by the device, and it is reachable
// with one thumb. It also does not import the office component tree, so the shared picker is not
// available to it. Its 5 native inputs (UploadDocumentModal x2, IncidentReport, LeaveRequestNew x2)
// are correct as they stand and are recorded here so a future reader knows they were examined, not
// missed.
const SCAN_ROOT = "apps/frontend/src";

// The shared pickers themselves are the ONE allowed home for a native control, so the canonical
// component is never fighting its own guard if it ever needs a hidden native input.
const EXEMPT_FILES = new Set([
  "apps/frontend/src/components/forms/DatePicker.tsx",
  "apps/frontend/src/components/forms/DateTimePicker.tsx",
]);

// ── shape (1): native datetime-local input ────────────────────────────────────────────────────
// Applied to an ALREADY-EXTRACTED <input> tag, so it deliberately does NOT re-anchor on
// `<input\b[^>]*` the way verify-no-raw-date-input.mjs does. That `[^>]*` prefix cannot cross a
// `>` that appears inside a `{...}` prop expression (e.g. `disabled={a > b} type="datetime-local"`),
// which silently un-detects the input; the selftest's "> inside a {} expr" case pins that. The
// brace/quote-aware extractTags() below already guarantees the string is one input tag, so the
// attribute test only needs the attribute.
const LITERAL_DATETIME_INPUT = /\btype\s*=\s*["']datetime-local["']/;
const DATETIME_TOKEN = /["']datetime-local["']/;

// ── shape (2): bare ISO date field rendered into a JSX text node ──────────────────────────────
// A member expression whose FINAL segment names a date-typed column. Anchored on the property
// name, not the object, so it is independent of how the row variable is spelled.
const DATE_FIELD = /^(?:[A-Za-z_$][\w$]*\.)+([A-Za-z_$][\w$]*)$/;
// NARROWED (with reason, never to go green): the expires/expiry/due/deadline family originally
// allowed an arbitrary `_<suffix>`, which matched `expiry_pill` — a STATUS ENUM
// ("red"|"amber"|"green"|"unknown") on the driver-DQF panel, not a date. That is a false positive,
// and a guard that cries wolf gets allowlisted into uselessness. The family now matches only the
// bare word or a genuine date suffix (`expiry_date`, `expires_at`, `due_on`).
const DATE_FIELD_NAME =
  /^(?:date|dob|(?:\w+_)?(?:date|at|on)|(?:\w*_)?(?:expires|expiry|due|deadline|birthday|anniversary)(?:_(?:date|at|on))?)$/i;

// Suffixes that mean "the SERVER already formatted this for display" — rendering them bare is
// correct and flagging them would be a false positive. Kept explicit and narrow.
//   _ct       → already rendered in Central Time by the backend (ProgramBoardPage's date_ct /
//               created_at_ct come off a view that formats them; see docs CLAUDE.md §8).
//   _display / _label / _us / _formatted → self-describing pre-formatted strings.
const PREFORMATTED_SUFFIX = /_(?:ct|display|label|us|formatted|text)$/i;

// Object names that are NOT record rows — a validation-error map keyed by field name holds the
// error MESSAGE for that field, never the date value. `{fieldErrors.accident_date}` renders
// "Accident date is required", so flagging it would be a false positive.
const NON_ROW_OBJECT = /^(?:field)?errors?$/i;

// Leaves that are a COUNT derived from a date, not a date: `days_until_expiry`, `expiry_days`,
// `overdue_count`. They render as a number and must not be date-formatted. Narrowed with a reason
// after `days_until_expiry` (an integer on the safety expiry dashboard) was flagged.
const NUMERIC_DERIVED_FIELD = /^(?:days?|count|num|total|n)_|_(?:days?|count|qty|cents|amount|total)$/i;

// A JSX text node holding exactly one expression container: `>{ expr }<`.
const JSX_TEXT_EXPR = />\s*\{\s*([A-Za-z_$][\w$.]*)\s*\}\s*</g;

// The same leak wearing an em-dash fallback: `>{ row.expiration_date ?? "—" }<` or
// `>{ form.plannedDate || "—" }<`. This is the SAME defect — the operator still sees a raw ISO
// string whenever the value is present — but the bare-expression pattern above cannot see it
// because the container holds more than the member expression. Found while migrating C3
// (border-crossing WizardStep6 rendered a full "YYYY-MM-DDTHH:mm" straight into the review step).
const JSX_TEXT_FALLBACK = />\s*\{\s*([A-Za-z_$][\w$.]*)\s*(?:\|\||\?\?)\s*[^{}]*\}\s*</g;

// The third shape: a ParityTable/column `render:` callback whose whole body is the bare date value,
// e.g. `render: (row) => row.hire_date ?? "—"`. There is no JSX text node at all here, so neither
// pattern above can see it, yet the cell renders raw ISO exactly the same way. Anchored on
// `render:` specifically so a `sortValue:` accessor or a `.filter(row => row.archived_at)`
// predicate — which never reach the screen — are not flagged.
const RENDER_ARROW_DATE =
  /\brender\s*:\s*\([^)]*\)\s*=>\s*([A-Za-z_$][\w$.]*)\s*(?=\?\?|\|\||[,)}\]]|$)/gm;

// A camelCase date leaf (plannedDate / occurredAt / effectiveOn). The repo is overwhelmingly
// snake_case because these are DB columns, but form state is camelCase — and form state is what a
// review/summary step renders.
const CAMEL_DATE_FIELD_NAME = /^[a-z][\w$]*(?:Date|At|On)$/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Brace/quote-aware JSX opening-tag extractor: a `>` inside a `{...}` expression or a string must
 *  not end the tag. Returns [{ tag, line }]. */
function extractTags(src, tagName) {
  const results = [];
  const re = new RegExp(`<${tagName}\\b`, "g");
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    let i = start + m[0].length;
    let depth = 0;
    let inString = null;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (inString) {
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) {
        i += 1;
        break;
      }
    }
    results.push({ tag: src.slice(start, i), line: src.slice(0, start).split("\n").length });
  }
  return results;
}

/** `type={...}` expression-container body (brace-matched), or null when `type=` is a quoted
 *  literal or absent. */
function typeExpressionBody(tag) {
  const idx = tag.search(/\btype\s*=\s*\{/);
  if (idx < 0) return null;
  const braceStart = tag.indexOf("{", idx);
  let depth = 0;
  for (let i = braceStart; i < tag.length; i += 1) {
    if (tag[i] === "{") depth += 1;
    else if (tag[i] === "}") {
      depth -= 1;
      if (depth === 0) return tag.slice(braceStart + 1, i);
    }
  }
  return null;
}

/** Literal `type="datetime-local"`, or a `type={...}` expression (ternary/map) containing a quoted
 *  "datetime-local" token. A bare-identifier passthrough `type={type}` has no quoted token and is
 *  correctly ignored — it only yields a native datetime box for a caller that already had to name
 *  the type, and that caller is itself scanned. */
function isNativeDateTimeInputTag(tag) {
  if (LITERAL_DATETIME_INPUT.test(tag)) return true;
  const body = typeExpressionBody(tag);
  return body != null && DATETIME_TOKEN.test(body);
}

/** Is this member expression a date-typed column/field that must be formatted before display? */
function isUnformattedDateExpression(expr) {
  const parts = expr.split(".");
  const mm = DATE_FIELD.exec(expr);
  if (!mm) return false;
  const field = mm[1];
  if (!DATE_FIELD_NAME.test(field) && !CAMEL_DATE_FIELD_NAME.test(field)) return false;
  if (PREFORMATTED_SUFFIX.test(field)) return false;
  if (NUMERIC_DERIVED_FIELD.test(field)) return false;
  if (parts.length >= 2 && NON_ROW_OBJECT.test(parts[parts.length - 2])) return false;
  return true;
}

/** Date-typed member expression rendered into a JSX text node — bare, or behind a ||/?? fallback. */
function bareIsoDateExpressions(src) {
  const out = [];
  for (const re of [JSX_TEXT_EXPR, JSX_TEXT_FALLBACK, RENDER_ARROW_DATE]) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      const expr = m[1];
      if (!isUnformattedDateExpression(expr)) continue;
      out.push({ expr, line: src.slice(0, m.index).split("\n").length });
    }
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}

function listTsx(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listTsx(full, out);
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
}

function scan(root) {
  const files = [];
  const abs = path.join(repoRoot, root);
  if (fs.existsSync(abs)) listTsx(abs, files);
  const nativeInputs = [];
  const isoDisplays = [];
  for (const full of files) {
    const rel = path.relative(repoRoot, full);
    if (EXEMPT_FILES.has(rel)) continue;
    const stripped = stripComments(fs.readFileSync(full, "utf8"));
    for (const { tag, line } of extractTags(stripped, "input")) {
      if (isNativeDateTimeInputTag(tag)) nativeInputs.push({ rel, line });
    }
    for (const hit of bareIsoDateExpressions(stripped)) {
      isoDisplays.push({ rel, line: hit.line, expr: hit.expr });
    }
  }
  return { files, nativeInputs, isoDisplays };
}

export function run() {
  const { files, nativeInputs, isoDisplays } = scan(SCAN_ROOT);
  const ok = nativeInputs.length === 0 && isoDisplays.length === 0;

  if (!ok) {
    console.error("[verify-no-native-datetime-input] FAIL — C3 date worklist\n");
    if (nativeInputs.length) {
      console.error(
        `(1) NATIVE <input type="datetime-local"> — ${nativeInputs.length} occurrence(s) in ` +
          `${new Set(nativeInputs.map((h) => h.rel)).size} file(s). Use <DateTimePicker/>:`
      );
      for (const h of nativeInputs) console.error(`  ✗ ${h.rel}:${h.line}`);
      console.error("");
    }
    if (isoDisplays.length) {
      console.error(
        `(2) BARE ISO DATE IN JSX TEXT — ${isoDisplays.length} occurrence(s) in ` +
          `${new Set(isoDisplays.map((h) => h.rel)).size} file(s). Wrap in formatDateUS()/formatDateTimeUS():`
      );
      for (const h of isoDisplays) console.error(`  ✗ ${h.rel}:${h.line}  {${h.expr}}`);
      console.error("");
    }
    console.error(`TOTAL ${nativeInputs.length + isoDisplays.length} problem(s) across ${files.length} .tsx files.`);
    return { ok: false, nativeInputs, isoDisplays };
  }

  console.log(
    `[verify-no-native-datetime-input] PASS — 0 native datetime-local inputs and 0 bare ISO date ` +
      `text nodes across ${files.length} .tsx files under ${SCAN_ROOT}.`
  );
  return { ok: true, nativeInputs, isoDisplays };
}

export function check() {
  return run().ok;
}

// ── selftest ──────────────────────────────────────────────────────────────────────────────────
function detectsInput(src) {
  return extractTags(stripComments(src), "input").some(({ tag }) => isNativeDateTimeInputTag(tag));
}
function detectsIso(src) {
  return bareIsoDateExpressions(stripComments(src)).length > 0;
}

function selftest() {
  const cases = [
    // (1) native datetime-local — MUST be caught
    { d: detectsInput, n: 'literal type="datetime-local" → CAUGHT', src: `<input type="datetime-local" value={v} onChange={f} />`, want: true },
    { d: detectsInput, n: "single-quoted type='datetime-local' → CAUGHT", src: `<input type='datetime-local' value={v} />`, want: true },
    { d: detectsInput, n: "attrs before type, multiline → CAUGHT", src: `<input\n  id="x"\n  className="h-8"\n  type="datetime-local"\n  value={v}\n/>`, want: true },
    { d: detectsInput, n: "dynamic ternary yielding datetime-local → CAUGHT", src: `<input type={f.withTime ? "datetime-local" : "text"} value={v} />`, want: true },
    { d: detectsInput, n: "register() spread + literal type → CAUGHT (the CreateWO shape)", src: `<input type="datetime-local" {...register("roadside_callout_at")} className="h-8" />`, want: true },
    { d: detectsInput, n: "> inside a {} expr does not truncate the tag → CAUGHT", src: `<input disabled={a > b} type="datetime-local" value={v} />`, want: true },
    // (1) corrected shape — MUST NOT be flagged
    { d: detectsInput, n: "CORRECTED <DateTimePicker/> → not flagged", src: `<DateTimePicker value={v} onChange={setV} />`, want: false },
    { d: detectsInput, n: "CORRECTED <DateTimePicker/> with min → not flagged", src: `<DateTimePicker id="due" value={dueLocal} onChange={setDueLocal} min={companyNow()} />`, want: false },
    { d: detectsInput, n: 'type="date" → not flagged here (owned by verify-step 107)', src: `<input type="date" value={v} />`, want: false },
    { d: detectsInput, n: "bare-identifier passthrough type={type} → not flagged", src: `<input type={type} value={v} />`, want: false },
    { d: detectsInput, n: "comment mentioning datetime-local → not flagged", src: `// C3: the old type="datetime-local" input was replaced by DateTimePicker.`, want: false },
    { d: detectsInput, n: "<Field type=\"datetime-local\"> wrapper prop → not flagged (not a raw input)", src: `<Field type="datetime-local" value={v} />`, want: false },
    { d: detectsInput, n: "text input → not flagged", src: `<input type="text" value={v} />`, want: false },
    // (2) bare ISO display — MUST be caught
    { d: detectsIso, n: "bare {row.transaction_date} → CAUGHT", src: `<span className="x">{row.transaction_date}</span>`, want: true },
    { d: detectsIso, n: "bare {invoice.issue_date} in a <td> → CAUGHT", src: `<td className="px-2">{invoice.issue_date}</td>`, want: true },
    { d: detectsIso, n: "bare {a.created_at} timestamp → CAUGHT", src: `<div className="t">{a.created_at}</div>`, want: true },
    { d: detectsIso, n: "bare {day.date} → CAUGHT", src: `<span>{day.date}</span>`, want: true },
    { d: detectsIso, n: "bare {p.expires_at} → CAUGHT", src: `<span>{p.expires_at}</span>`, want: true },
    { d: detectsIso, n: "bare {t.due_date} → CAUGHT", src: `<span>{t.due_date}</span>`, want: true },
    { d: detectsIso, n: "bare {d.effective_on} → CAUGHT", src: `<span>{d.effective_on}</span>`, want: true },
    { d: detectsIso, n: 'em-dash fallback {row.expiration_date ?? "—"} → CAUGHT', src: `<span>{row.expiration_date ?? "—"}</span>`, want: true },
    { d: detectsIso, n: 'em-dash fallback {f.pickup_date || "—"} → CAUGHT', src: `<dd>{f.pickup_date || "—"}</dd>`, want: true },
    { d: detectsIso, n: "camelCase form-state {form.plannedDate} → CAUGHT", src: `<dd>{form.plannedDate}</dd>`, want: true },
    { d: detectsIso, n: 'camelCase behind a fallback {form.plannedDate || "—"} → CAUGHT', src: `<dd>{form.plannedDate || "—"}</dd>`, want: true },
    // (2) corrected shape + controls — MUST NOT be flagged
    { d: detectsIso, n: "CORRECTED {formatDateUS(row.transaction_date)} → not flagged", src: `<span>{formatDateUS(row.transaction_date)}</span>`, want: false },
    { d: detectsIso, n: "CORRECTED {formatDateTimeUS(a.created_at)} → not flagged", src: `<div>{formatDateTimeUS(a.created_at)}</div>`, want: false },
    { d: detectsIso, n: "CORRECTED {formatInCompanyTimeZone(x.occurred_at, o)} → not flagged", src: `<div>{formatInCompanyTimeZone(x.occurred_at, opts)}</div>`, want: false },
    { d: detectsIso, n: "validation-error map {fieldErrors.accident_date} → not flagged (holds a message)", src: `<p>{fieldErrors.accident_date}</p>`, want: false },
    { d: detectsIso, n: "server-preformatted {d.date_ct} → not flagged", src: `<span>{d.date_ct}</span>`, want: false },
    { d: detectsIso, n: "server-preformatted {q.created_at_ct} → not flagged", src: `<span>{q.created_at_ct}</span>`, want: false },
    { d: detectsIso, n: "non-date field {row.status} → not flagged", src: `<span>{row.status}</span>`, want: false },
    { d: detectsIso, n: "non-date field {row.driver_name} → not flagged", src: `<span>{row.driver_name}</span>`, want: false },
    { d: detectsIso, n: "money field {row.amount_cents} → not flagged", src: `<span>{row.amount_cents}</span>`, want: false },
    { d: detectsIso, n: 'CORRECTED fallback {formatDateUS(row.expiration_date) || "—"} → not flagged', src: `<span>{formatDateUS(row.expiration_date) || "—"}</span>`, want: false },
    { d: detectsIso, n: 'CORRECTED fallback {formatDateTimeLocalUS(form.plannedDate) || "—"} → not flagged', src: `<dd>{formatDateTimeLocalUS(form.plannedDate) || "—"}</dd>`, want: false },
    { d: detectsIso, n: 'non-date behind a fallback {row.status || "—"} → not flagged', src: `<span>{row.status || "—"}</span>`, want: false },
    { d: detectsIso, n: "camelCase non-date {form.driverName} → not flagged", src: `<dd>{form.driverName}</dd>`, want: false },
    { d: detectsIso, n: 'status enum {item.expiry_pill ?? "unknown"} → not flagged (red/amber/green, not a date)', src: `<span>{item.expiry_pill ?? "unknown"}</span>`, want: false },
    { d: detectsIso, n: "still catches the real {p.expiry_date} despite that narrowing", src: `<span>{p.expiry_date}</span>`, want: true },
    { d: detectsIso, n: 'render arrow `render: (row) => row.hire_date ?? "—"` → CAUGHT', src: `{ key: "hire", render: (row) => row.hire_date ?? "—" },`, want: true },
    { d: detectsIso, n: "render arrow with no fallback → CAUGHT", src: `{ render: (item) => item.effective_date },`, want: true },
    { d: detectsIso, n: "CORRECTED render arrow formatDateUS(...) → not flagged", src: `{ render: (row) => formatDateUS(row.hire_date) ?? "—" },`, want: false },
    { d: detectsIso, n: "sortValue accessor → not flagged (never rendered)", src: `{ sortValue: (row) => row.hire_date },`, want: false },
    { d: detectsIso, n: "filter predicate → not flagged (never rendered)", src: `all.filter((row) => row.archived_at)`, want: false },
    { d: detectsIso, n: "render arrow on a non-date column → not flagged", src: `{ render: (row) => row.status ?? "—" },`, want: false },
    { d: detectsIso, n: "date-derived COUNT {row.days_until_expiry} → not flagged (a number, not a date)", src: `<span>{row.days_until_expiry}</span>`, want: false },
    { d: detectsIso, n: "still catches the real {row.expiry_date} next to that count", src: `<span>{row.expiry_date}</span>`, want: true },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = c.d(c.src);
    const ok = got === c.want;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (detected=${got}, want=${c.want})`);
  }

  // Meta-assertion: prove the selftest is CAPABLE of failing. If the detectors were stubbed to a
  // constant (the "selftest that cannot fail" anti-pattern), one of these two must break.
  const positives = cases.filter((c) => c.want).length;
  const negatives = cases.length - positives;
  if (positives === 0 || negatives === 0) {
    console.error("\n[verify-no-native-datetime-input] SELFTEST INVALID — needs both positive and negative cases");
    process.exit(1);
  }
  if (detectsInput(`<input type="datetime-local" />`) === detectsInput(`<input type="text" />`)) {
    console.error("\n[verify-no-native-datetime-input] SELFTEST INVALID — input detector is constant");
    process.exit(1);
  }
  if (detectsIso(`<span>{row.event_date}</span>`) === detectsIso(`<span>{row.status}</span>`)) {
    console.error("\n[verify-no-native-datetime-input] SELFTEST INVALID — iso detector is constant");
    process.exit(1);
  }

  if (failed) {
    console.error(`\n[verify-no-native-datetime-input] SELFTEST FAILED: ${failed} of ${cases.length}`);
    process.exit(1);
  }
  console.log(
    `\n[verify-no-native-datetime-input] SELFTEST PASS — ${cases.length} cases ` +
      `(${positives} planted defects all caught, ${negatives} corrected/control shapes all clean)`
  );
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
