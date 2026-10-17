#!/usr/bin/env node
/**
 * ACCT-F5705 — both customer-payment create routes (customer-payments.routes.ts's
 * POST /:id/payments, and its duplicate write path payments.routes.ts's POST /payments) gated the
 * post-or-skip-audit pair on `applicationsCount > 0` — a condition `buildCustomerPaymentLines`
 * (posting-engine.service.ts) never needed, since it posts purely from
 * accounting.payments.amount_cents with zero dependency on payment_applications. A real,
 * UI-supported zero-application payment (a customer credit / unapplied cash / prepayment,
 * CustomerDetail.tsx's creditBalanceCents flow) therefore never attempted a GL post AND never even
 * logged a flag-skip — a silent gap distinct from the earlier ACCT-F150/CLS-SUBLEDGER-GL-DARK fix
 * (which covered the case where applications DID exist but the poster was never wired at all).
 *
 * FAIL: either route still gates the post call or the skip-audit call on `applicationsCount > 0`.
 * PASS: both routes always either post or skip-audit, regardless of applications count.
 *
 * Self-test: node scripts/verify-customer-payment-posts-with-zero-applications.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-customer-payment-posts-with-zero-applications";
const ROUTE_A = "apps/backend/src/accounting/customer-payments.routes.ts";
const ROUTE_B = "apps/backend/src/accounting/payments.routes.ts";

function failures(sources) {
  const out = [];
  for (const file of [ROUTE_A, ROUTE_B]) {
    const text = sources[file];
    const flagIdx = text.indexOf('isEnabled(client, "CUSTOMER_PAYMENT_GL_POSTING_ENABLED"');
    if (flagIdx === -1) {
      out.push(`${file}: CUSTOMER_PAYMENT_GL_POSTING_ENABLED flag resolution not found — re-check this guard`);
      continue;
    }
    // Scope to the flag resolution + the if/else pair immediately following it.
    const scoped = text.slice(flagIdx, flagIdx + 1400);
    if (/if \(applicationsCount > 0 && customerPaymentPostingEnabled\)/.test(scoped) || /^\s*if \(applicationsCount > 0\)/m.test(scoped)) {
      out.push(`${file}: the post call is still gated on applicationsCount > 0 — a zero-application payment (real customer credit) would never post`);
    }
    if (/else if \(applicationsCount > 0\)/.test(scoped)) {
      out.push(`${file}: the skip-audit call is still gated on applicationsCount > 0 — a zero-application payment with the flag OFF would silently skip with no audit trail`);
    }
  }
  return out;
}

const live = {
  [ROUTE_A]: fs.readFileSync(ROUTE_A, "utf8"),
  [ROUTE_B]: fs.readFileSync(ROUTE_B, "utf8"),
};

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: `${ROUTE_A}: reintroduce the applicationsCount post gate`,
      file: ROUTE_A,
      mutate: (text) => text.replace("if (customerPaymentPostingEnabled) {", "if (applicationsCount > 0 && customerPaymentPostingEnabled) {"),
    },
    {
      name: `${ROUTE_A}: reintroduce the applicationsCount skip-audit gate`,
      file: ROUTE_A,
      mutate: (text) =>
        text.replace(
          `      } else {\n        await recordPostingFlagSkip(client, user.uuid, {\n          flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",\n          postingDomain: "customer_payment",\n          operatingCompanyId: query.data.operating_company_id,\n          context: { payment_id: payment.id, route: "POST /api/v1/customers/:id/payments" },`,
          `      } else if (applicationsCount > 0) {\n        await recordPostingFlagSkip(client, user.uuid, {\n          flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",\n          postingDomain: "customer_payment",\n          operatingCompanyId: query.data.operating_company_id,\n          context: { payment_id: payment.id, route: "POST /api/v1/customers/:id/payments" },`
        ),
    },
    {
      name: `${ROUTE_B}: reintroduce the applicationsCount post gate`,
      file: ROUTE_B,
      mutate: (text) => text.replace("if (customerPaymentPostingEnabled) {", "if (applicationsCount > 0 && customerPaymentPostingEnabled) {"),
    },
    {
      name: `${ROUTE_B}: reintroduce the applicationsCount skip-audit gate`,
      file: ROUTE_B,
      mutate: (text) =>
        text.replace(
          `      } else {\n        await recordPostingFlagSkip(client, user.uuid, {\n          flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",\n          postingDomain: "customer_payment",\n          operatingCompanyId: query.data.operating_company_id,\n          context: { payment_id: payment.id, route: "POST /api/v1/accounting/payments" },`,
          `      } else if (applicationsCount > 0) {\n        await recordPostingFlagSkip(client, user.uuid, {\n          flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",\n          postingDomain: "customer_payment",\n          operatingCompanyId: query.data.operating_company_id,\n          context: { payment_id: payment.id, route: "POST /api/v1/accounting/payments" },`
        ),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — both customer-payment create routes post-or-skip-audit every real payment, including zero-application payments (customer credits)`);
