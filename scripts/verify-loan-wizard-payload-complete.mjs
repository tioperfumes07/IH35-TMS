#!/usr/bin/env node
/**
 * DoD-B for the Loans & Advances wizard: NO RENDERED-BUT-UNSENT FIELD.
 *
 * The failure this prevents is silent and expensive: a wizard renders a control, the operator fills
 * it in, submit succeeds — and the value was never in the request body. The record is created with a
 * missing term (an APR, a payment count, a funding source) and nothing anywhere says so. On a loan
 * that is a wrong balance and a wrong amortization schedule.
 *
 * THREE-WAY CHECK, so drift on any side fails:
 *   1. Every control in LoanApplicationWizard.tsx writes through `set("<field>", …)`. Each of those
 *      field names must be consumed by `buildPayload` (directly, or via a documented derivation —
 *      e.g. principal_dollars -> principal_cents, interest_rate_pct -> interest_rate_bps).
 *   2. Every REQUIRED key of the backend `createBodySchema`
 *      (apps/backend/src/accounting/related-party-loan-posting/routes.ts) must be produced by
 *      `buildPayload`. If the backend adds a required field, this fails until the wizard sends it.
 *   3. `buildPayload` must not invent a key the backend does not accept (zod strips/rejects it and
 *      the operator's input vanishes silently).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-loan-wizard-payload-complete";
const WIZARD = "apps/frontend/src/pages/accounting/loans/LoanApplicationWizard.tsx";
const ROUTES = "apps/backend/src/accounting/related-party-loan-posting/routes.ts";

/**
 * Form fields that are deliberately transformed rather than sent verbatim. The VALUE is the payload
 * key each one lands in, so a rename on either side still fails this guard.
 */
const DERIVED = {
  principal_dollars: "principal_cents",
  interest_rate_pct: "interest_rate_bps",
};

/** Control fields: every `set("<name>", …)` call in the wizard. */
export function wizardControlFields(src) {
  return [...src.matchAll(/\bset\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

/** Keys the payload builder actually emits: literal `key:` plus `payload.key =` assignments. */
export function payloadKeys(src) {
  const start = src.indexOf("export function buildPayload");
  if (start < 0) return [];
  const end = src.indexOf("\nexport function", start + 1);
  const body = src.slice(start, end < 0 ? undefined : end);
  const keys = new Set();
  // `key: value` …
  for (const m of body.matchAll(/^\s{4}([a-z_]+):/gm)) keys.add(m[1]);
  // … and ES shorthand `key,` — the first parser missed these and reported principal_cents as
  // dropped when it was in fact sent. A guard that cries wolf gets disabled, so shorthand counts.
  for (const m of body.matchAll(/^\s{4}([a-z_]+),\s*$/gm)) keys.add(m[1]);
  for (const m of body.matchAll(/payload\.([a-z_]+)\s*=/g)) keys.add(m[1]);
  return [...keys];
}

/** Backend contract: keys of createBodySchema, and which are required (no .optional()). */
export function backendSchemaKeys(src) {
  const start = src.indexOf("const createBodySchema");
  if (start < 0) return { all: [], required: [] };
  const end = src.indexOf("});", start);
  const body = src.slice(start, end < 0 ? undefined : end);
  // A zod field can span several lines (`payment_frequency: z\n  .enum([...])\n  .optional(),`), so
  // slice each top-level key's chunk and test the WHOLE chunk for .optional()/.default(). Testing
  // one line reported multi-line optionals as required and as unknown keys — both false alarms.
  const all = [];
  const required = [];
  const starts = [...body.matchAll(/^ {2}([a-z_]+):\s*z\b/gm)];
  for (let i = 0; i < starts.length; i++) {
    const name = starts[i][1];
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : body.length;
    const chunk = body.slice(from, to);
    all.push(name);
    if (!/\.optional\(\)|\.default\(|\.nullable\(\)/.test(chunk)) required.push(name);
  }
  return { all, required };
}

export function audit({ wizardSrc, routesSrc }) {
  const problems = [];
  const controls = wizardControlFields(wizardSrc);
  const payload = new Set(payloadKeys(wizardSrc));
  const { all, required } = backendSchemaKeys(routesSrc);

  if (controls.length === 0) problems.push(`${WIZARD}: no set("field") controls found — parser is stale, refusing to pass vacuously.`);
  if (payload.size === 0) problems.push(`${WIZARD}: buildPayload emitted no keys — parser is stale, refusing to pass vacuously.`);
  if (all.length === 0) problems.push(`${ROUTES}: createBodySchema not parsed — parser is stale, refusing to pass vacuously.`);

  // 1. rendered -> sent
  for (const field of controls) {
    const target = DERIVED[field] ?? field;
    if (!payload.has(target)) {
      problems.push(
        `${WIZARD}: the wizard renders a control for "${field}" but buildPayload never emits ` +
          `"${target}". The operator can fill it in and submit successfully while the value is ` +
          `silently dropped — that is the rendered-but-unsent defect (DoD-B).`
      );
    }
  }

  // 2. backend required -> sent
  for (const key of required) {
    if (!payload.has(key)) {
      problems.push(
        `${ROUTES}: createBodySchema REQUIRES "${key}" but buildPayload never emits it — every ` +
          `submit will 400, or the backend will fall back to a default the operator never chose.`
      );
    }
  }

  // 3. sent -> accepted
  const allowed = new Set(all);
  for (const key of payload) {
    if (!allowed.has(key)) {
      problems.push(
        `${WIZARD}: buildPayload emits "${key}", which is not a key of createBodySchema. zod will ` +
          `drop or reject it, so the operator's input disappears with no error.`
      );
    }
  }
  return problems;
}

function readIf(rel) {
  const abs = join(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

function auditTree() {
  const wizardSrc = readIf(WIZARD);
  const routesSrc = readIf(ROUTES);
  if (!wizardSrc) return [`${WIZARD} not found — the guarded wizard is gone.`];
  if (!routesSrc) return [`${ROUTES} not found — cannot verify against the backend contract.`];
  return audit({ wizardSrc, routesSrc });
}

function selftest() {
  const failures = [];
  const routes = `
const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  direction: z.enum(["in", "out"]),
  principal_cents: z.number().int().positive(),
  funding_source_note: z.string().trim().max(500).optional(),
});
`;
  const good = `
export function buildPayload(form, id) {
  const payload = {
    operating_company_id: id,
    direction: form.direction,
    principal_cents,
  };
  if (form.funding_source_note.trim()) payload.funding_source_note = form.funding_source_note.trim();
  return payload;
}
export function other() {}
`;
  const goodWizard = `set("direction", x); set("principal_dollars", x); set("funding_source_note", x);\n${good}`;
  if (audit({ wizardSrc: goodWizard, routesSrc: routes }).length !== 0)
    failures.push(`case1 FAIL — a complete wizard was flagged: ${audit({ wizardSrc: goodWizard, routesSrc: routes }).join(" | ")}`);

  // A control that never reaches the payload — the real defect.
  const dropped = `set("direction", x); set("principal_dollars", x); set("funding_source_note", x); set("interest_rate_pct", x);\n${good}`;
  if (audit({ wizardSrc: dropped, routesSrc: routes }).length === 0)
    failures.push("case2 FAIL — a rendered-but-unsent control was NOT caught");

  // Backend adds a required key the wizard does not send.
  const routesPlus = routes.replace("  direction:", "  entry_date: z.string().date(),\n  direction:");
  if (audit({ wizardSrc: goodWizard, routesSrc: routesPlus }).length === 0)
    failures.push("case3 FAIL — a newly-required backend key missing from the payload was NOT caught");

  // Payload invents a key the backend does not accept.
  const invented = goodWizard.replace("    principal_cents,", "    principal_cents,\n    bogus_key: 1,");
  if (audit({ wizardSrc: invented, routesSrc: routes }).length === 0)
    failures.push("case4 FAIL — a payload key the backend does not accept was NOT caught");

  // Stale parsers must fail loudly rather than pass on zero findings.
  if (audit({ wizardSrc: "no controls here", routesSrc: routes }).length === 0)
    failures.push("case5 FAIL — a stale parser passed vacuously");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case6 FAIL — real source flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — dropped control, new required key, invented key and stale parsers all caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every rendered wizard field reaches the POST body and matches the backend contract`);
}

main();
