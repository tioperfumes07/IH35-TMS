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
// Heavy CI peel (Lead 13:45Z): the engine moved byte-for-byte out of ROUTE_B into a plain service module (the apply
// service imported the route module to reach it — verify-steps 12399). Same rule, read from the engine's own file.
const ENGINE = "apps/backend/src/accounting/payment-writer.service.ts";

// 443.182 C step 2 — both create routes hand their document to the one payments engine (ROUTE_B,
// recordCustomerPaymentInClientTx), which posts-or-skip-audits through postCustomerPaymentOrRecordSkipInClientTx. The
// ACCT-F5705 rule now has to hold in the ENGINE: the flag resolution's if/else is ungated, and the engine's call to it is
// not gated on applicationsCount. Each route must delegate (no route-level post of its own).
function failures(sources) {
  const out = [];
  const engine = sources[ENGINE];
  const flagIdx = engine.indexOf('isEnabled(client, "CUSTOMER_PAYMENT_GL_POSTING_ENABLED"');
  if (flagIdx === -1) {
    out.push(`${ENGINE}: CUSTOMER_PAYMENT_GL_POSTING_ENABLED flag resolution not found in the payments engine — re-check this guard`);
  } else {
    const scoped = engine.slice(flagIdx, flagIdx + 1400);
    if (/if \(applicationsCount > 0 && enabled\)/.test(scoped) || /^\s*if \(applicationsCount > 0\)/m.test(scoped)) {
      out.push(`${ENGINE}: the post call is gated on applicationsCount > 0 — a zero-application payment (real customer credit) would never post`);
    }
    if (/else if \(applicationsCount > 0\)/.test(scoped) || !/\} else \{\s*await recordPostingFlagSkip\(/.test(scoped)) {
      out.push(`${ENGINE}: the skip-audit call is gated (or missing) — a zero-application payment with the flag OFF would silently skip with no audit trail`);
    }
  }
  const engineBody = (engine.match(/export async function recordCustomerPaymentInClientTx\([\s\S]*?\n}\n/) ?? [""])[0];
  const callIdx = engineBody.indexOf("await postCustomerPaymentOrRecordSkipInClientTx(client, {");
  if (callIdx === -1) {
    out.push(`${ENGINE}: recordCustomerPaymentInClientTx does not post-or-skip-audit every payment`);
  } else if (/if \(applicationsCount > 0\)[^\n]*\n?[^\n]*$/.test(engineBody.slice(Math.max(0, callIdx - 200), callIdx))) {
    out.push(`${ENGINE}: the engine's post-or-skip call is gated on applicationsCount > 0`);
  }
  for (const file of [ROUTE_A, ROUTE_B]) {
    if (!/recordCustomerPaymentInClientTx\(client, \{/.test(sources[file].replace(engineBody, ""))) {
      out.push(`${file}: the create route does not hand its payment to the one payments engine`);
    }
  }
  return out;
}

const live = {
  [ROUTE_A]: fs.readFileSync(ROUTE_A, "utf8"),
  [ROUTE_B]: fs.readFileSync(ROUTE_B, "utf8"),
  [ENGINE]: fs.readFileSync(ENGINE, "utf8"),
};

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: `${ENGINE}: gate the engine's post on applicationsCount`,
      file: ENGINE,
      mutate: (text) => text.replace("  if (enabled) {", "  if (applicationsCount > 0 && enabled) {"),
    },
    {
      name: `${ENGINE}: gate the engine's skip-audit on applicationsCount`,
      file: ENGINE,
      mutate: (text) => text.replace("  } else {\n    await recordPostingFlagSkip(client, input.user_id, {", "  } else if (applicationsCount > 0) {\n    await recordPostingFlagSkip(client, input.user_id, {"),
    },
    {
      name: `${ENGINE}: gate the engine's post-or-skip call on applicationsCount`,
      file: ENGINE,
      mutate: (text) => text.replace("  await postCustomerPaymentOrRecordSkipInClientTx(client, {\n    operating_company_id: oci,", "  if (applicationsCount > 0) await postCustomerPaymentOrRecordSkipInClientTx(client, {\n    operating_company_id: oci,"),
    },
    {
      name: `${ROUTE_B}: the Receive Payment route stops using the engine`,
      file: ROUTE_B,
      mutate: (text) => text.replace("recordCustomerPaymentInClientTx(client, {", "somethingElse(client, {"),
    },
    {
      name: `${ROUTE_A}: the customer route stops using the engine`,
      file: ROUTE_A,
      mutate: (text) => text.replace("recordCustomerPaymentInClientTx(client, {", "somethingElse(client, {"),
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
console.log(`${LABEL} PASS — both customer-payment create routes go through the one payments engine, which posts-or-skip-audits every real payment, including zero-application payments (customer credits)`);
