#!/usr/bin/env node
/**
 * verify-vendor-bill-create-persists-lines.mjs  (LAW-E2E #3167 / LAW §9)
 *
 * Root cause it locks: VendorBillForm built TwoSectionLine[] then submitted only header fields + a
 * memo stub (`lines_preview:…`); createBillBodySchema had no `lines`; createBill INSERTed
 * accounting.bills only — live Neon had 16,196 bills and 0 bill_lines, so CHAIN-03 poster could not
 * resolve DR legs even with BILL_GL_POSTING_ENABLED ON.
 *
 * Asserts (static, comment-stripped where noted):
 *   1. bills.routes.ts createBillBodySchema accepts `lines` with account_id + amount_cents
 *   2. bills.service.ts createBill INSERTs accounting.bill_lines in the same function body as the
 *      bills header INSERT (fail-closed when lines provided)
 *   3. VendorBillForm submits a `lines:` payload (not memo-only lines_preview)
 *   4. createVendorBill API body type includes lines
 *
 * Self-test: node scripts/verify-vendor-bill-create-persists-lines.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROUTES_REL = "apps/backend/src/accounting/bills.routes.ts";
const SERVICE_REL = "apps/backend/src/accounting/bills.service.ts";
const FORM_REL = "apps/frontend/src/components/accounting/VendorBillForm.tsx";
const API_REL = "apps/frontend/src/api/accounting.ts";

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Slice `export async function createBill(...)` up to the next top-level export. */
function createBillBody(src) {
  const start = src.search(/export\s+async\s+function\s+createBill\s*\(/);
  if (start < 0) return "";
  const rest = src.slice(start);
  const next = rest.slice(1).search(/\nexport\s+/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/**
 * @param {{ routesSrc: string, serviceSrc: string, formSrc: string, apiSrc: string }} inputs
 * @returns {string[]}
 */
export function evaluate({ routesSrc, serviceSrc, formSrc, apiSrc }) {
  const failures = [];
  const routes = stripComments(routesSrc);
  const service = stripComments(serviceSrc);
  const form = stripComments(formSrc);
  const api = stripComments(apiSrc);

  // 1. Schema accepts lines
  if (!/createBillBodySchema[\s\S]*?\blines:\s*z\.array\(/.test(routes)) {
    failures.push(`${ROUTES_REL} — createBillBodySchema must accept lines: z.array(...)`);
  }
  if (!/account_id:\s*z\.string\(\)\.uuid\(\)/.test(routes) || !/amount_cents:\s*z\.coerce\.number\(\)/.test(routes)) {
    failures.push(`${ROUTES_REL} — createBillLineSchema must require amount_cents and accept account_id uuid`);
  }

  // 2. createBill persists bill_lines + fail-closed
  const body = createBillBody(service);
  if (!body) {
    failures.push(`${SERVICE_REL} — createBill() not found`);
  } else {
    if (!/INSERT\s+INTO\s+accounting\.bill_lines\b/i.test(body)) {
      failures.push(`${SERVICE_REL} — createBill() must INSERT INTO accounting.bill_lines`);
    }
    if (!/INSERT\s+INTO\s+accounting\.bills\b/i.test(body)) {
      failures.push(`${SERVICE_REL} — createBill() must still INSERT INTO accounting.bills`);
    }
    if (!/bill_lines_required/.test(body)) {
      failures.push(`${SERVICE_REL} — createBill() must fail closed with bill_lines_required when lines sent empty`);
    }
    if (!/bill_lines_amount_mismatch/.test(body)) {
      failures.push(`${SERVICE_REL} — createBill() must reject bill_lines_amount_mismatch`);
    }
    // Same-txn: both INSERTs must appear inside the withCurrentUser callback of createBill
    const withUserIdx = body.search(/withCurrentUser\s*\(/);
    const billsIns = body.search(/INSERT\s+INTO\s+accounting\.bills\b/i);
    const linesIns = body.search(/INSERT\s+INTO\s+accounting\.bill_lines\b/i);
    if (withUserIdx < 0 || billsIns < withUserIdx || linesIns < withUserIdx) {
      failures.push(`${SERVICE_REL} — bill_lines INSERT must run inside the same withCurrentUser txn as the bill header`);
    }
  }

  // 3. Frontend sends lines (not memo-only stub)
  if (/lines_preview:/.test(form) || /bill_form_stub:v1/.test(form)) {
    failures.push(`${FORM_REL} — must not memo-stub lines (lines_preview / bill_form_stub)`);
  }
  if (!/export\s+function\s+buildVendorBillLinePayloads/.test(formSrc) && !/buildVendorBillLinePayloads/.test(formSrc)) {
    failures.push(`${FORM_REL} — must use buildVendorBillLinePayloads`);
  }
  // Prefer the pure helper module when present (keeps React out of unit tests).
  // Still require VendorBillForm to send lines: linePayloads (or equivalent).
  if (!/\blines:\s*linePayloads\b/.test(form) && !/\blines:\s*buildVendorBillLinePayloads/.test(form)) {
    if (!/lines:\s*[a-zA-Z_][\w]*\b/.test(form) || !/buildVendorBillLinePayloads/.test(form)) {
      failures.push(`${FORM_REL} — handleSubmit must send lines: … from buildVendorBillLinePayloads`);
    }
  }

  // 4. API client includes lines on createVendorBill
  if (!/export\s+function\s+createVendorBill\s*\(/.test(apiSrc)) {
    failures.push(`${API_REL} — createVendorBill not found`);
  } else {
    // Slice from createVendorBill to the next export function (avoid nested-brace fragility).
    const start = apiSrc.search(/export\s+function\s+createVendorBill\s*\(/);
    const slice = apiSrc.slice(start, start + 1200);
    if (!/\blines\s*:/.test(slice)) {
      failures.push(`${API_REL} — createVendorBill body must include lines`);
    }
  }

  return failures;
}

function readRepo(root) {
  return {
    routesSrc: fs.readFileSync(path.join(root, ROUTES_REL), "utf8"),
    serviceSrc: fs.readFileSync(path.join(root, SERVICE_REL), "utf8"),
    formSrc: fs.readFileSync(path.join(root, FORM_REL), "utf8"),
    apiSrc: fs.readFileSync(path.join(root, API_REL), "utf8"),
  };
}

function selftest() {
  const good = {
    routesSrc: `
      const createBillLineSchema = z.object({ account_id: z.string().uuid().optional(), amount_cents: z.coerce.number().int().positive() });
      const createBillBodySchema = z.object({ lines: z.array(createBillLineSchema).max(200).optional() });
    `,
    serviceSrc: `
      export async function createBill(input, userId) {
        if (input.lines !== undefined) {
          if (!input.lines || input.lines.length === 0) throw new Error("bill_lines_required");
          if (sum !== input.amountCents) throw new Error("bill_lines_amount_mismatch");
        }
        const bill = await withCurrentUser(userId, async (client) => {
          await client.query(\`INSERT INTO accounting.bills (...)\`);
          await client.query(\`INSERT INTO accounting.bill_lines (...)\`);
          return created;
        });
        return bill;
      }
      export async function payBill() {}
    `,
    formSrc: `
      export function buildVendorBillLinePayloads(lines) { return []; }
      await onSubmit({ lines: linePayloads, amount_cents: amountCents });
    `,
    apiSrc: `
      export function createVendorBill(operatingCompanyId, body: { lines: Array<{ amount_cents: number }> }) {
        return apiRequest(url, { method: "POST", body });
      }
    `,
  };
  const badMemoOnly = {
    ...good,
    formSrc: `parts.push(\`lines_preview:\${preview}\`); await onSubmit({ memo: parts.join(), amount_cents: 1 });`,
    serviceSrc: `
      export async function createBill(input, userId) {
        const bill = await withCurrentUser(userId, async (client) => {
          await client.query(\`INSERT INTO accounting.bills (...)\`);
          return created;
        });
        return bill;
      }
      export async function payBill() {}
    `,
  };

  const goodFails = evaluate(good);
  const badFails = evaluate(badMemoOnly);
  const checks = [
    ["wired path passes", goodFails.length === 0],
    ["memo-only / no bill_lines INSERT is caught", badFails.length > 0],
  ];
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`selftest FAIL: ${label}`);
      if (label.startsWith("wired")) console.error(goodFails);
      process.exit(1);
    }
  }
  console.log("verify-vendor-bill-create-persists-lines selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const root = process.cwd();
  const failures = evaluate(readRepo(root));
  if (failures.length) {
    console.error("verify:vendor-bill-create-persists-lines — FAILED");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log("verify:vendor-bill-create-persists-lines PASS (createBill persists bill_lines; UI sends lines)");
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main();
