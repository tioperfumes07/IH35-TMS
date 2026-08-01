#!/usr/bin/env node
/**
 * ACCT-F59 / REVREC-INTERLOCK-01 — the invoice A/R poster must REFUSE to post a load-sourced
 * invoice whose load already carries an active revenue-recognition latch row.
 *
 * WHY THIS EXISTS (verified live on prod br-fancy-credit-akjnd07a, 2026-08-01):
 * Two posters both credit revenue and both debit A/R for the SAME load:
 *   DISP-01 latch Event 1   DR Unbilled Revenue / CR Freight Revenue
 *   DISP-01 latch Event 2   DR A/R              / CR Unbilled Revenue
 *   invoice A/R poster      DR A/R              / CR income (per line)   <-- doubles BOTH
 * `revrec-delivery-posting/poster.service.ts` documents the incompatibility in a comment and says to
 * keep INVOICE_AR_GL_POSTING_ENABLED OFF for load-sourced invoices while the latch is ON. A comment
 * is not a control. Read from lib.feature_flag_overrides with the bypass as its own statement
 * (visible 213 == n_live_tup 213, so a complete read, not an RLS-masked one):
 *   REVENUE_RECOGNITION_POST_ENABLED  TRANSP=true  USMCA=true  TRK=false
 *   INVOICE_AR_GL_POSTING_ENABLED     TRANSP=true  TRK=true    USMCA=true
 * Both ON for the operating carrier. Nothing had double-posted only because 0 of 11,977 invoices
 * carried source_load_id — they are all QBO clone history. INVOICE_PROFORMA_PIPELINE_ENABLED (also
 * true for TRANSP + USMCA) makes the office transition create and auto-send a load-sourced invoice
 * at delivered_pending_docs, so the first genuinely delivered load arms it: revenue and A/R both
 * overstated on the live general ledger.
 *
 * WHAT WOULD SILENTLY REGRESS THIS:
 *  1. Deleting the interlock to make an invoice-posting test go green.
 *  2. Re-keying it on the FEATURE FLAG instead of the latch row. That looks equivalent and is not:
 *     if REVENUE_RECOGNITION_POST_ENABLED is turned off AFTER a load has earned, the Event 1 revenue
 *     is still on the books, and a flag-keyed check would wave the invoice through. The durable fact
 *     is the latch row, not the switch. This guard fails on a flag-keyed rewrite.
 *  3. Softening the refusal into a silent skip — an invoice that looks posted while its GL effect
 *     lives somewhere else is worse than a loud failure.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";
const LABEL = "verify-revrec-invoice-double-post-interlock";

/** Strip comments so the guard cannot be satisfied — or tripped — by prose about itself. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Isolate buildInvoiceLines so the interlock cannot be "present" merely by existing somewhere else
 * in a 2,000-line file. It has to be in the function that actually builds the invoice posting.
 */
/**
 * Brace-balanced body extraction. Indentation-agnostic on purpose: an earlier version sliced to the
 * first "\n}" and silently matched nothing when the function was indented, so the flag-keyed
 * regression it was meant to catch sailed through. A guard that depends on formatting fails open.
 */
export function extractFunctionBody(code, signature) {
  const start = code.indexOf(signature);
  if (start === -1) return null;
  const open = code.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return null;
}

export function extractBuildInvoiceLines(code) {
  return extractFunctionBody(code, "async function buildInvoiceLines");
}

export function auditEngine(src) {
  const problems = [];
  const code = stripComments(src);

  if (!/revrecLatchOwnsLoad/.test(code)) {
    problems.push(
      `${ENGINE} has no revrecLatchOwnsLoad interlock — a load-sourced invoice would post DR A/R / ` +
        `CR income over a load the DISP-01 latch already recognized, doubling revenue AND A/R.`
    );
    return problems;
  }

  if (!/load_revenue_recognition_postings/.test(code)) {
    problems.push(`${ENGINE} never reads accounting.load_revenue_recognition_postings — the latch it must interlock against.`);
  }

  if (!/INVOICE_REVREC_LATCH_OWNS_LOAD/.test(code)) {
    problems.push(`${ENGINE} defines no INVOICE_REVREC_LATCH_OWNS_LOAD error code — the refusal must be named, not anonymous.`);
  }

  // The lookup must key on the latch row's own liveness, not on the posting feature flag.
  const lookupBody = extractFunctionBody(code, "async function revrecLatchOwnsLoad") ?? "";
  if (!/is_active/.test(lookupBody)) {
    problems.push(
      `${ENGINE} revrecLatchOwnsLoad does not filter on is_active — it must key on the latch row's ` +
        `own liveness flag so a reversed latch releases the interlock.`
    );
  }
  if (/REVENUE_RECOGNITION_POST_ENABLED|isEnabled\s*\(/.test(lookupBody)) {
    problems.push(
      `${ENGINE} revrecLatchOwnsLoad consults the posting feature flag. Turning ` +
        `REVENUE_RECOGNITION_POST_ENABLED off AFTER a load earned does not un-recognize its revenue, ` +
        `so a flag-keyed interlock reopens the double-post. Key on the latch row only.`
    );
  }

  const fn = extractBuildInvoiceLines(code);
  if (!fn) {
    problems.push(`${ENGINE} has no buildInvoiceLines — cannot verify the interlock is wired into invoice posting.`);
    return problems;
  }
  if (!/revrecLatchOwnsLoad/.test(fn)) {
    problems.push(
      `${ENGINE} buildInvoiceLines does not call revrecLatchOwnsLoad — the interlock exists but is ` +
        `never applied to invoice posting (a dead helper posts nothing and prevents nothing).`
    );
    return problems;
  }
  if (!/source_load_id/.test(fn)) {
    problems.push(`${ENGINE} buildInvoiceLines does not gate the interlock on source_load_id — only load-sourced invoices can overlap the latch.`);
  }
  if (!/throw new InvoiceRevrecLatchOwnsLoadError/.test(fn)) {
    problems.push(
      `${ENGINE} buildInvoiceLines does not THROW on an owned load — a silent skip leaves an invoice ` +
        `looking posted while its GL effect lives elsewhere. The refusal must be loud.`
    );
  }

  // The refusal must precede account resolution: refusing after resolving is still a refusal, but it
  // buries the real cause under an unrelated ACCOUNT_MAPPING_MISSING when a role is unbound.
  const iLatch = fn.indexOf("revrecLatchOwnsLoad");
  const iAr = fn.indexOf("resolveArAccountForCompany");
  if (iAr !== -1 && iLatch > iAr) {
    problems.push(`${ENGINE} buildInvoiceLines resolves the A/R account before the latch interlock — refuse first, so the reported cause is the real one.`);
  }

  return problems;
}

function auditTree() {
  return auditEngine(readFileSync(join(ROOT, ENGINE), "utf8"));
}

function selftest() {
  const failures = [];

  // case1 — no interlock at all (the pre-fix shape).
  const noInterlock = `
    async function buildInvoiceLines(client, operatingCompanyId, sourceId) {
      const arAccountId = await resolveArAccountForCompany(client, operatingCompanyId);
      return { lines: [] };
    }
  `;
  if (auditEngine(noInterlock).length === 0) failures.push("case1 FAIL — a poster with NO interlock was not caught");

  // case2 — DEAD helper: defined, never called from buildInvoiceLines.
  const deadHelper = `
    async function revrecLatchOwnsLoad(client, opco, loadId) {
      const r = await client.query("SELECT id FROM accounting.load_revenue_recognition_postings WHERE is_active LIMIT 1");
      return Boolean(r.rows[0]);
    }
    class X { constructor() { super("INVOICE_REVREC_LATCH_OWNS_LOAD", "x"); } }
    async function buildInvoiceLines(client, operatingCompanyId, sourceId) {
      const arAccountId = await resolveArAccountForCompany(client, operatingCompanyId);
      return { lines: [] };
    }
  `;
  if (!auditEngine(deadHelper).some((p) => p.includes("never applied to invoice posting")))
    failures.push("case2 FAIL — the dead-helper direction was NOT caught");

  // case3 — flag-keyed rewrite: looks equivalent, reopens the hole.
  const flagKeyed = `
    async function revrecLatchOwnsLoad(client, opco, loadId) {
      const on = await isEnabled(client, "REVENUE_RECOGNITION_POST_ENABLED", { operating_company_id: opco });
      if (!on) return false;
      const r = await client.query("SELECT id FROM accounting.load_revenue_recognition_postings WHERE is_active LIMIT 1");
      return Boolean(r.rows[0]);
    }
    class X { constructor() { super("INVOICE_REVREC_LATCH_OWNS_LOAD", "x"); } }
    async function buildInvoiceLines(client, operatingCompanyId, sourceId) {
      if (invoice.source_load_id && (await revrecLatchOwnsLoad(client, operatingCompanyId, invoice.source_load_id))) {
        throw new InvoiceRevrecLatchOwnsLoadError(invoice.source_load_id, "Invoice X");
      }
      const arAccountId = await resolveArAccountForCompany(client, operatingCompanyId);
      return { lines: [] };
    }
  `;
  if (!auditEngine(flagKeyed).some((p) => p.includes("consults the posting feature flag")))
    failures.push("case3 FAIL — the flag-keyed rewrite was NOT caught");

  // case4 — silent skip instead of a throw.
  const silentSkip = `
    async function revrecLatchOwnsLoad(client, opco, loadId) {
      const r = await client.query("SELECT id FROM accounting.load_revenue_recognition_postings WHERE is_active LIMIT 1");
      return Boolean(r.rows[0]);
    }
    class X { constructor() { super("INVOICE_REVREC_LATCH_OWNS_LOAD", "x"); } }
    async function buildInvoiceLines(client, operatingCompanyId, sourceId) {
      if (invoice.source_load_id && (await revrecLatchOwnsLoad(client, operatingCompanyId, invoice.source_load_id))) {
        return { lines: [] };
      }
      const arAccountId = await resolveArAccountForCompany(client, operatingCompanyId);
      return { lines: [] };
    }
  `;
  if (!auditEngine(silentSkip).some((p) => p.includes("must be loud")))
    failures.push("case4 FAIL — the silent-skip direction was NOT caught");

  // case5 — the real tree must be clean (proves the fix is actually in place).
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real source flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — missing interlock caught, dead helper caught, flag-keyed rewrite ` +
      `caught, silent skip caught, real source clean`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — a load-sourced invoice whose load already carries an active revenue-recognition ` +
      `latch row is refused, so revenue and A/R cannot be recognized twice for one load`
  );
}

main();
