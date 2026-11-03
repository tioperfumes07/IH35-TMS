#!/usr/bin/env node
/**
 * Register rows 183 201 205 206 219 228 245 246 251 253 (design audit D004 D025 D029 D030 D043 D052 D069 D070 D075 D077)
 * — house date standard is MM/DD/YYYY (zero-padded, four-digit year); with time MM/DD/YYYY, h:mm AM/PM.
 * Root cause measured 11-03: those screens printed dates through local code (DD/MM axis, M/D/YY cells, raw ISO,
 * MON-DD planner headers, "Thu, Oct 22" navigators, unpadded locale strings) instead of apps/frontend/src/lib/formatDate.ts.
 * Static: (1) the shared module still emits the padded four-digit shape and its legacy aliases delegate to it;
 * (2) each screen's date call site goes through the shared formatter; (3) no screen file carries a non-standard
 * date construct (toLocaleDateString, 2-digit year, month names, MON-DD helper, unpinned locale string).
 * --selftest plants the old formatting back into each file in memory; every plant must be caught.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dates-use-shared-us-format";
const FE = "apps/frontend/src/";
const SHARED = `${FE}lib/formatDate.ts`;
// mmmDd is the legacy alias the owner ruling 10-24 repointed at formatDateUS (the shared check below pins that delegation).
const US = "(?:formatDateUS|formatDateQboList|formatDate|mmmDd)";

// utils/qboFormat re-exports the same functions from lib/formatDate (checked below) — either import is the shared one.
const IMPORT_SHARED = /from "(?:\.\.\/)+(?:lib\/formatDate|utils\/qboFormat)"|from "\.\/formatDate"/;
const REEXPORT = `${FE}utils/qboFormat.ts`;
const FORBIDDEN = [
  [/toLocaleDateString\(/, "toLocaleDateString (browser/locale shape)"],
  [/year:\s*"2-digit"/, "two-digit year"],
  [/month:\s*"(?:short|long|narrow|numeric)"/, "month name / unpadded month option"],
  [/formatPlannerDayLabel\(/, "MON-DD planner day label"],
  [/"(?:Jan|JAN)",\s*"(?:Feb|FEB)"/, "month-name array"],
  [/toLocaleString\((?:undefined)?\s*[,)]/, "unpinned locale toLocaleString"],
];

/** row, file, required call sites (each a RegExp that must match), plants (old formatting put back). */
const SCREENS = [
  { row: 183, file: "pages/home/charts/WeeklyRevenueChart.tsx",
    required: [new RegExp(`label: ${US}\\(row\\.date\\)`), new RegExp(`labelFull: ${US}\\(row\\.date\\)`)],
    plants: [["DD/MM axis", "label: formatDate(row.date) || row.date,", "label: `${row.date.slice(8, 10)}/${row.date.slice(5, 7)}`,"]] },
  { row: 201, file: "pages/accounting/LoadCostsBoardPage.tsx",
    required: [new RegExp(`r\\.pickup_date \\? ${US}\\(r\\.pickup_date\\)`), new RegExp(`r\\.actual_delivery_at \\? ${US}\\(r\\.actual_delivery_at\\)`)],
    plants: [
      ["M/D/YY pickup", "r.pickup_date ? formatDateQboList(r.pickup_date)", "r.pickup_date ? new Date(r.pickup_date).toLocaleDateString(\"en-US\", { month: \"numeric\", day: \"numeric\", year: \"2-digit\" })"],
      ["M/D/YY delivery", "r.actual_delivery_at ? formatDateQboList(r.actual_delivery_at)", "r.actual_delivery_at ? r.actual_delivery_at.slice(5, 10)"],
    ] },
  { row: 205, file: "pages/tasks/ReconcilerExceptionsPage.tsx",
    required: [new RegExp(`render: \\(row\\) => ${US}\\(row\\.since\\)`)],
    plants: [["ISO Since", "render: (row) => formatDateUS(row.since)", "render: (row) => String(row.since).slice(0, 10)"]] },
  { row: 206, file: "pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
    required: [new RegExp(`${US}\\(range\\.start\\)`), new RegExp(`${US}\\(range\\.end\\)`), new RegExp(`\\{${US}\\(d\\)\\}`)],
    plants: [
      ["ISO subtitle", "${formatDateUS(range.start)} through ${formatDateUS(range.end)}", "${range.start} through ${range.end}"],
      ["MON-DD grid", "{formatDateUS(d)}", "{formatPlannerDayLabel(d)}"],
    ] },
  { row: 219, file: "pages/cash-flow/tabs/DailyPredictionTab.tsx",
    required: [/function fmtChipDate\(iso: string\): string \{[\s\S]{0,400}?const us = formatDateUS\(iso\);[\s\S]{0,80}?\$\{wd\} \$\{us\}/, /function fmtLongDate\(iso: string\): string \{\s*return formatDateUS\(iso\);/],
    plants: [["chip without year", "return us ? `${wd} ${us}` : \"—\";", "return `${wd} ${String(m).padStart(2, \"0\")}-${String(d).padStart(2, \"0\")}`;"]] },
  { row: 219, file: "pages/cash-flow/tabs/RollingLedgerTab.tsx",
    required: [/function fmtNavDate\(iso: string\): string \{[\s\S]{0,400}?const us = formatDateUS\(iso\);[\s\S]{0,80}?\$\{wd\}, \$\{us\}/, /function fmtDateShort\(iso: string\): string \{\s*return formatDateUS\(iso\);/],
    plants: [
      ["navigator month name", "const us = formatDateUS(iso);\n  return us ? `${wd}, ${us}` : \"—\";", "const mon = [\"Jan\", \"Feb\", \"Mar\", \"Apr\", \"May\", \"Jun\", \"Jul\", \"Aug\", \"Sep\", \"Oct\", \"Nov\", \"Dec\"][m - 1] ?? \"\";\n  return `${wd}, ${mon} ${d}`;"],
      ["due cell without year", "function fmtDateShort(iso: string): string {\n  return formatDateUS(iso);", "function fmtDateShort(iso: string): string {\n  return iso.slice(5, 10);"],
    ] },
  { row: 219, file: "pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
    required: [/return `\$\{wd\}, \$\{formatDateUS\(projectionDate\)\}`;/, /const dateLabel = projectionDate \? formatDateUS\(projectionDate\)/],
    plants: [["navigator month name", "return `${wd}, ${formatDateUS(projectionDate)}`;", "return `${wd}, ${new Date(projectionDate).toLocaleDateString(\"en-US\", { month: \"short\", day: \"numeric\" })}`;"]] },
  { row: 228, file: "pages/form425c/tabs/HistoryTab.tsx",
    required: [/r\.filed_at \? formatDateTimeUS\(r\.filed_at\)/],
    plants: [["unpadded Filed", "r.filed_at ? formatDateTimeUS(r.filed_at)", "r.filed_at ? new Date(r.filed_at).toLocaleString()"]] },
  { row: 245, file: "pages/accounting/ReclassifyTransactionsPage.tsx",
    required: [new RegExp(`Balance \\{${US}\\(toDate\\)\\}`)],
    plants: [["two-digit-year heading", "Balance {formatDateQboList(toDate)}", "Balance {new Date(toDate).toLocaleDateString(\"en-US\", { year: \"2-digit\" })}"]] },
  { row: 246, file: "pages/banking/components/MatchDrawer.tsx",
    required: [new RegExp(`Date: \\{${US}\\(c\\.event_date\\)`)],
    plants: [["ISO candidate date", "Date: {formatDateUS(c.event_date) || \"—\"}", "Date: {c.event_date || \"—\"}"]] },
  { row: 246, file: "pages/banking/components/CategorizeDrawer.tsx",
    required: [new RegExp(`Date: \\{${US}\\(transaction\\.txn_date\\)`)],
    plants: [["ISO categorize date", "Date: {formatDateUS(transaction.txn_date) || \"—\"}", "Date: {String(transaction.txn_date ?? \"\")}"]] },
  { row: 246, file: "pages/banking/BankTxCategorizationPage.tsx",
    required: [new RegExp(`render: \\(tx\\) => ${US}\\(txDate\\(tx\\)\\)`), new RegExp(`Date:</span> \\{${US}\\(txDate\\(selectedTx\\)\\)`)],
    plants: [
      ["ISO list cell", "render: (tx) => formatDateUS(txDate(tx)) || \"—\",", "render: (tx) => txDate(tx) || \"—\","],
      ["ISO detail", "{formatDateUS(txDate(selectedTx)) || \"—\"}", "{txDate(selectedTx)}"],
    ] },
  { row: 251, file: "components/dispatch/TourLoadRows.tsx",
    required: [new RegExp(`r\\.pickup_date \\? ${US}\\(r\\.pickup_date\\)`), new RegExp(`r\\.delivery_date \\? ${US}\\(r\\.delivery_date\\)`)],
    plants: [
      ["OCT-21 pickup", "r.pickup_date ? mmmDd(r.pickup_date)", "r.pickup_date ? formatPlannerDayLabel(r.pickup_date)"],
      ["OCT-21 delivery", "r.delivery_date ? mmmDd(r.delivery_date)", "r.delivery_date ? String(r.delivery_date).slice(5, 10)"],
    ] },
  { row: 251, file: "pages/driver-finance/SettlementsToursRegister.tsx",
    required: [/label=\{formatDateUS\(date\)\}/, /\{formatDateUS\(date\)\}<\/span>/, new RegExp(`r\\.trip_started_at \\? ${US}\\(r\\.trip_started_at\\)`)],
    plants: [
      ["OCT-21 PU/DEL", "label={formatDateUS(date)}", "label={formatPlannerDayLabel(date)}"],
      ["OCT-21 started", "r.trip_started_at ? mmmDd(r.trip_started_at)", "r.trip_started_at ? new Date(r.trip_started_at).toLocaleDateString(\"en-US\", { month: \"short\", day: \"2-digit\" })"],
    ] },
  { row: 253, file: "pages/accounting/EscrowPage.tsx",
    required: [/function dt\(value: string\) \{\s*return formatDateTimeUS\(value\)/],
    plants: [["unpadded Updated", "return formatDateTimeUS(value) || value;", "return new Date(value).toLocaleString(undefined, { dateStyle: \"short\", timeStyle: \"short\" });"]] },
];

const SHARED_PLANTS = [
  ["unpadded month/day", "return `${pad2(parts.mo)}/${pad2(parts.d)}/${parts.y}`;", "return `${parts.mo}/${parts.d}/${parts.y}`;"],
  ["two-digit year list style", "export function formatDateQboList(value: unknown): string {\n  return formatDateUS(value);", "export function formatDateQboList(value: unknown): string {\n  const p = formatDateUS(value);\n  return p.slice(0, 6) + p.slice(8);"],
  ["MMM-DD resurrected", "export function mmmDd(value: unknown): string {\n  // OWNER RULING", "export function mmmDd(value: unknown): string {\n  if (value) return String(value).toUpperCase();\n  // OWNER RULING"],
  ["unpadded timestamp", "    month: \"2-digit\",\n    day: \"2-digit\",\n    year: \"numeric\",\n    hour: \"numeric\",", "    month: \"numeric\",\n    day: \"numeric\",\n    year: \"numeric\",\n    hour: \"numeric\","],
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

export function findSharedDefects(src) {
  const out = [];
  if (!/return `\$\{pad2\(parts\.mo\)\}\/\$\{pad2\(parts\.d\)\}\/\$\{parts\.y\}`;/.test(src)) out.push(`${SHARED}: formatDateUS no longer returns zero-padded MM/DD/YYYY`);
  if (!/export function formatDateQboList\(value: unknown\): string \{\s*return formatDateUS\(value\);\s*\}/.test(src)) out.push(`${SHARED}: formatDateQboList does not delegate to formatDateUS`);
  if (!/export function mmmDd\(value: unknown\): string \{\s*(?:\/\/[^\n]*\n\s*)*return formatDateUS\(value\);\s*\}/.test(src)) out.push(`${SHARED}: mmmDd does not delegate to formatDateUS`);
  if (!/export const formatDate = formatDateUS;/.test(src)) out.push(`${SHARED}: formatDate alias is not formatDateUS`);
  const dt = src.slice(src.indexOf("export function formatDateTimeUS("), src.indexOf("export function formatDateTimeLocalUS("));
  if (!/month: "2-digit",\s*day: "2-digit",\s*year: "numeric"/.test(dt)) out.push(`${SHARED}: formatDateTimeUS is not zero-padded four-digit year`);
  return out;
}

export function findScreenDefects(screen, src) {
  const out = [];
  const where = `row ${screen.row} ${FE}${screen.file}`;
  if (!IMPORT_SHARED.test(src)) out.push(`${where}: does not import the shared lib/formatDate`);
  for (const re of screen.required) if (!re.test(src)) out.push(`${where}: date call site no longer goes through the shared formatter (${re.source.slice(0, 60)})`);
  const code = stripComments(src);
  for (const [re, what] of FORBIDDEN) if (re.test(code)) out.push(`${where}: non-standard date construct — ${what}`);
  return out;
}

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  let total = 0;
  const shared = read(SHARED);
  for (const [name, from, to] of SHARED_PLANTS) {
    total++;
    const planted = shared.replace(from, to);
    const hit = planted !== shared && findSharedDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: shared formatDate.ts — ${name}`);
    if (hit) caught++;
  }
  for (const screen of SCREENS) {
    const src = read(FE + screen.file);
    for (const [name, from, to] of screen.plants) {
      total++;
      const planted = src.replace(from, to);
      const hit = planted !== src && findScreenDefects(screen, planted).length > 0;
      console.log(`${hit ? "ok  " : "MISS"}  plant: row ${screen.row} ${screen.file} — ${name}`);
      if (hit) caught++;
    }
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${total} planted defects caught`);
  process.exit(caught === total ? 0 : 1);
}

const defects = [...findSharedDefects(read(SHARED))];
if (!/export \{[^}]*\bformatDateUS\b[^}]*\} from "\.\.\/lib\/formatDate";/.test(read(REEXPORT))) defects.push(`${REEXPORT}: no longer re-exports formatDateUS from lib/formatDate`);
for (const screen of SCREENS) defects.push(...findScreenDefects(screen, read(FE + screen.file)));
if (defects.length) {
  console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`);
  process.exit(1);
}
const rows = [...new Set(SCREENS.map((s) => s.row))];
console.log(`${LABEL} PASS — ${SCREENS.length} files on rows ${rows.join(" ")} render dates through lib/formatDate (MM/DD/YYYY)`);
