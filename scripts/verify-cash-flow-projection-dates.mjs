#!/usr/bin/env node
/**
 * LEAD 443.140 #8(b) — CASH-FLOW PROJECTIONS. Lead spec, verbatim:
 *   "cash-flow/cash-flow.service.ts + projected-cash-date.ts — customer receipts on the invoice due date (or the Faro
 *    funding date when factored), driver bills on their due date (= projected delivery, 289d317c), card payables 2510
 *    on the card payment date, Relay wallet top-ups; a late load moves its bill and its receipt; uses your 8c basis
 *    engine."
 *
 * The rule, on the sources (no database): every cash date the projection service puts on a source is computed by the ONE
 * projected-cash-date engine (apps/backend/src/cash-flow/projected-cash-date.ts), never re-derived inline.
 *   ENGINE_IMPORT       the service imports the engine, and the engine exports every name it imports;
 *   RAW_DELIVERY_BUCKET no raw scheduled-delivery date in the service (a stop / ETA timestamp cast or truncated to a day,
 *                       or an inline COALESCE over predicted_delivery_date) — the delivery anchor is the engine's;
 *   INLINE_LAG          no receivable / payment lag math in the service (net terms, factoring lag, the lag constants,
 *                       interval arithmetic, a JS day-add by terms) — the lag is the engine's;
 *   SOURCE_NOT_ENGINE   every SQL template that reads one of the five sources and yields or compares a date carries an
 *                       engine call: customer receipts (accounting.invoices, accounting.factoring_advances, mdata.loads),
 *                       driver bills (driver_finance.driver_bills), card payables 2510 (accounting.expenses),
 *                       Relay wallet top-ups (integrations.relay_deposits); the late-load move rides mdata.loads.
 * Comments are not code: // and block comments in the TypeScript and -- comments inside SQL templates are ignored.
 *
 * Exit 1 on any finding (fail closed: a missing source file is a finding, never a crash).
 * --selftest: plants each violation into a copy of the real service and must see it refused; the same text placed only
 * in a comment must not move the finding count; a small compliant service must pass with zero findings.
 * --json: machine-readable findings.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cash-flow-projection-dates";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  service: "apps/backend/src/cash-flow/cash-flow.service.ts",
  engine: "apps/backend/src/cash-flow/projected-cash-date.ts",
};
const ENGINE_SPECIFIER = "./projected-cash-date.js";

const SOURCE_TABLES = [
  ["customer receipt", "accounting.invoices"],
  ["customer receipt (factored)", "accounting.factoring_advances"],
  ["customer receipt / late load", "mdata.loads"],
  ["driver bill", "driver_finance.driver_bills"],
  ["card payable 2510", "accounting.expenses"],
  ["Relay wallet top-up", "integrations.relay_deposits"],
];

const RAW_DELIVERY = [
  /\b(?:scheduled_arrival_at|scheduled_departure_at|appointment_start_at|appointment_end_at|predicted_delivery_date|actual_arrival_at|actual_departure_at)\s*\)?\s*::\s*date\b/i,
  /\b(?:date|date_trunc)\s*\(\s*(?:'day'\s*,\s*)?[\w.]*(?:scheduled_arrival_at|appointment_start_at|predicted_delivery_date)\b/i,
  /\bCOALESCE\s*\(\s*[\w.]*predicted_delivery_date\b/i,
];

const INLINE_LAG = [
  /\bdays_until_due\b/,
  /\bfactoring_eligible\b/,
  /\b(?:FACTORING_ADVANCE_DAYS|DEFAULT_NET_TERMS_DAYS|receivableLagDays)\b/,
  /\bterms_?days\b/i,
  /from\s+["'][^"']*receivable-lag(?:\.js)?["']/,
  /setUTCDate\([^)]*\+\s*[\w.]*(?:term|lag|net)/i,
  /\*\s*INTERVAL\s*'1\s*day'/i,
  /\bmake_interval\s*\(\s*days\s*=>/i,
  /\+\s*INTERVAL\s*'\d+\s*days?'/i,
];

const DATE_MARKER = /\b\w*due_date\b|\bbucket_date\b|::\s*date\b|\bBETWEEN\b|\b(?:advanced_at|collected_at|relay_created_at|transaction_date)\b/i;

/**
 * Blank comments (keeping every newline and offset) and list the outermost template literals.
 * States: code, '…', "…", `…` with ${ … } nesting, // and block comments; inside template text, SQL `--` comments.
 */
export function scan(src) {
  const out = src.split("");
  const templates = [];
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  // stack frames: { kind: "tpl", start } | { kind: "interp", depth }
  const stack = [];
  let i = 0;
  const n = src.length;
  const inTemplateText = () => stack.length > 0 && stack[stack.length - 1].kind === "tpl";
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inTemplateText()) {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") {
        const fr = stack.pop();
        if (stack.length === 0) templates.push({ start: fr.start, end: i + 1 });
        i += 1;
        continue;
      }
      if (c === "$" && c2 === "{") { stack.push({ kind: "interp", depth: 0 }); i += 2; continue; }
      if (c === "-" && c2 === "-") {
        let j = i;
        while (j < n && src[j] !== "\n" && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j++;
        blank(i, j);
        i = j;
        continue;
      }
      i += 1;
      continue;
    }
    // code (top level or inside ${ })
    if (c === "/" && c2 === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && c2 === "*") {
      const j = src.indexOf("*/", i + 2);
      const end = j < 0 ? n : j + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      i = j + 1;
      continue;
    }
    if (c === "`") { stack.push({ kind: "tpl", start: i }); i += 1; continue; }
    const top = stack[stack.length - 1];
    if (top && top.kind === "interp") {
      if (c === "{") top.depth += 1;
      else if (c === "}") {
        if (top.depth === 0) { stack.pop(); i += 1; continue; }
        top.depth -= 1;
      }
    }
    i += 1;
  }
  return { code: out.join(""), templates };
}

const lineOf = (text, offset) => text.slice(0, offset).split("\n").length;

/** The rule, pure: findings for one service text + engine text (either may be "" when missing). */
export function projectionDateFindings(serviceSrc, engineSrc) {
  const findings = [];
  const add = (rule, line, msg) => findings.push({ rule, file: F.service, line, msg });
  if (!serviceSrc) {
    findings.push({ rule: "ENGINE_IMPORT", file: F.service, line: 0, msg: "the projection service is missing" });
    return findings;
  }
  if (!engineSrc) findings.push({ rule: "ENGINE_IMPORT", file: F.engine, line: 0, msg: "the projected-cash-date engine is missing" });

  const { code, templates } = scan(serviceSrc);

  // ENGINE_IMPORT
  const engineNames = [];
  const importRe = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (let m; (m = importRe.exec(code)); ) {
    if (m[2] !== ENGINE_SPECIFIER) continue;
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      const exported = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
      if (!name) continue;
      engineNames.push(name);
      if (engineSrc && !new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${exported}\\b`).test(scan(engineSrc).code)) {
        add("ENGINE_IMPORT", lineOf(code, m.index), `imports ${exported} from the engine, which does not export it`);
      }
    }
  }
  if (engineNames.length === 0) add("ENGINE_IMPORT", 1, `the service does not import the projected-cash-date engine (${ENGINE_SPECIFIER})`);

  // RAW_DELIVERY_BUCKET + INLINE_LAG, line by line on comment-blanked code
  const lines = code.split("\n");
  lines.forEach((ln, k) => {
    if (RAW_DELIVERY.some((re) => re.test(ln))) add("RAW_DELIVERY_BUCKET", k + 1, `raw delivery date outside the engine: ${ln.trim().slice(0, 140)}`);
    if (INLINE_LAG.some((re) => re.test(ln))) add("INLINE_LAG", k + 1, `lag math outside the engine: ${ln.trim().slice(0, 140)}`);
  });

  // SOURCE_NOT_ENGINE, per outermost template literal
  const engineCall = engineNames.length ? new RegExp(`\\$\\{[^]*?\\b(?:${engineNames.join("|")})\\s*\\(`) : null;
  for (const t of templates) {
    const body = code.slice(t.start, t.end);
    const hits = SOURCE_TABLES.filter(([, table]) => new RegExp(`\\b(?:FROM|JOIN)\\s+${table.replace(".", "\\.")}\\b`, "i").test(body));
    if (hits.length === 0) continue;
    if (!DATE_MARKER.test(body)) continue;
    if (engineCall && engineCall.test(body)) continue;
    add("SOURCE_NOT_ENGINE", lineOf(code, t.start), `${hits.map(([what, table]) => `${what} (${table})`).join(" + ")} dated without the projected-cash-date engine`);
  }
  return findings;
}

function loadReal() {
  const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
  return { service: read(F.service), engine: read(F.engine) };
}

const key = (f) => `${f.rule}|${f.msg}`;
function newFindings(base, next) {
  const counts = new Map();
  for (const f of base) counts.set(key(f), (counts.get(key(f)) ?? 0) + 1);
  const added = [];
  for (const f of next) {
    const c = counts.get(key(f)) ?? 0;
    if (c > 0) counts.set(key(f), c - 1);
    else added.push(f);
  }
  return added;
}

function selftest() {
  const real = loadReal();
  if (!real.service || !real.engine) {
    console.error(`${LABEL} SELFTEST FAIL: a real source is missing (${F.service} / ${F.engine})`);
    process.exit(1);
  }
  const base = projectionDateFindings(real.service, real.engine);
  const append = (snippet) => `${real.service}\n${snippet}\n`;
  const plants = [
    ["RAW_DELIVERY_BUCKET", "raw stop bucket", append("export const __p1 = `SELECT 1 FROM mdata.load_stops ls WHERE ls.scheduled_arrival_at::date = $2::date`;")],
    ["RAW_DELIVERY_BUCKET", "inline effective delivery", append("export const __p2 = `SELECT COALESCE(l.predicted_delivery_date, now()) AS d FROM mdata.load_stops ls`;")],
    ["RAW_DELIVERY_BUCKET", "date_trunc of the appointment", append("export const __p3 = `SELECT date_trunc('day', ls.appointment_start_at) FROM mdata.load_stops ls`;")],
    ["INLINE_LAG", "net terms in SQL", append("export const __p4 = `SELECT 1 FROM catalogs.payment_terms pt WHERE pt.days_until_due > 0`;")],
    ["INLINE_LAG", "factoring lag inline", append("export const __p5 = `SELECT CASE WHEN c.factoring_eligible THEN 0 ELSE 30 END FROM mdata.customers c`;")],
    ["INLINE_LAG", "JS day-add by terms", append("export function __p6(d: Date, termsDays: number) { d.setUTCDate(d.getUTCDate() + termsDays); return d; }")],
    ["INLINE_LAG", "lag constant imported", `import { DEFAULT_NET_TERMS_DAYS as __L } from "../dispatch/receivable-lag.js";\n${real.service}`],
    ["INLINE_LAG", "interval lag", append("export const __p8 = `SELECT (now()::date + 30 * INTERVAL '1 day') FROM mdata.customers c`;")],
    ["SOURCE_NOT_ENGINE", "driver bill dated raw", append("export const __p9 = `SELECT db.id FROM driver_finance.driver_bills db WHERE db.due_date = $2::date`;")],
    ["SOURCE_NOT_ENGINE", "Relay top-up dated raw", append("export const __p10 = `SELECT rd.id FROM integrations.relay_deposits rd WHERE rd.relay_created_at >= $2`;")],
    ["SOURCE_NOT_ENGINE", "2510 card payable dated raw", append("export const __p11 = `SELECT e.id FROM accounting.expenses e WHERE e.transaction_date = $2::date`;")],
    ["ENGINE_IMPORT", "engine import removed", real.service.replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/projected-cash-date\.js["'];?/, "")],
    ["ENGINE_IMPORT", "engine stops exporting the imported name", null],
  ];
  const nearMisses = [
    ["line comment", append("// SELECT 1 FROM mdata.load_stops ls WHERE ls.scheduled_arrival_at::date = $2::date AND pt.days_until_due > 0")],
    ["block comment", append("/* d.setUTCDate(d.getUTCDate() + termsDays); c.factoring_eligible; DEFAULT_NET_TERMS_DAYS; COALESCE(l.predicted_delivery_date, x) */")],
    ["SQL -- comment", append("export const __n3 = `\n  SELECT 1 -- ls.scheduled_arrival_at::date, pt.days_until_due, 30 * INTERVAL '1 day'\n  FROM org.companies\n`;")],
    ["commented-out source query", append("// const q = `SELECT db.id FROM driver_finance.driver_bills db WHERE db.due_date = $2::date`;")],
  ];
  let failed = 0;
  let passed = 0;
  for (const [rule, label, text] of plants) {
    let findings;
    if (text === null) {
      const engine = real.engine.replace(/export\s+function\s+projectedCashDateSql\b/, "function projectedCashDateSql");
      if (engine === real.engine) { console.error(`  FAIL plant inert: ${label}`); failed += 1; continue; }
      findings = projectionDateFindings(real.service, engine);
    } else {
      if (text === real.service) { console.error(`  FAIL plant inert: ${label}`); failed += 1; continue; }
      findings = projectionDateFindings(text, real.engine);
    }
    const added = newFindings(base, findings).filter((f) => f.rule === rule);
    if (added.length === 0) { console.error(`  FAIL plant not refused: ${label} (${rule})`); failed += 1; }
    else { console.log(`  ok   plant refused: ${label} -> ${rule}`); passed += 1; }
  }
  for (const [label, text] of nearMisses) {
    const added = newFindings(base, projectionDateFindings(text, real.engine));
    if (added.length) { console.error(`  FAIL near miss flagged: ${label}: ${added.map((f) => f.msg).join("; ")}`); failed += 1; }
    else { console.log(`  ok   near miss ignored: ${label}`); passed += 1; }
  }
  const compliant = [
    'import { projectedCashDateSql } from "./projected-cash-date.js";',
    "// every date comes from the engine",
    "export const q = `",
    "  SELECT i.id, ${projectedCashDateSql({ deliveryScheduledExpr: \"fd.scheduled_arrival_at\" })} AS bucket_date",
    "  FROM accounting.invoices i",
    "  JOIN mdata.loads l ON l.id = i.source_load_id",
    "  WHERE i.operating_company_id = $1::uuid",
    "`;",
  ].join("\n");
  const clean = projectionDateFindings(compliant, real.engine);
  if (clean.length) { console.error(`  FAIL compliant service flagged: ${clean.map((f) => `${f.rule} ${f.msg}`).join("; ")}`); failed += 1; }
  else { console.log("  ok   compliant service passes with 0 findings"); passed += 1; }

  const total = passed + failed;
  if (failed) {
    console.error(`${LABEL} SELFTEST FAIL: ${failed} of ${total} checks failed`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS: ${passed}/${total} (${plants.length} plants refused, ${nearMisses.length} comment near misses ignored, 1 compliant control clean); real main baseline = ${base.length} finding(s)`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (!invokedDirectly) {
  // imported for its pure rule — run nothing
} else if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const real = loadReal();
  const findings = projectionDateFindings(real.service, real.engine);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ label: LABEL, findings }, null, 2));
  if (findings.length) {
    const byRule = findings.reduce((m, f) => ((m[f.rule] = (m[f.rule] ?? 0) + 1), m), {});
    if (!process.argv.includes("--json")) {
      for (const f of findings) console.error(`  ${f.rule}  ${f.file}:${f.line}  ${f.msg}`);
    }
    console.error(`${LABEL} FAIL: ${findings.length} finding(s) ${JSON.stringify(byRule)}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS: every projected cash date in ${F.service} comes from ${F.engine}`);
}
