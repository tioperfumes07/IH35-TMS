#!/usr/bin/env node
// verify-bill-payment-posts-gl (P1-BILLPAY-GL regression guard)
// Every bill-payment writer must post the bill_payment JE ATOMICALLY (same transaction as the
// bank-cache decrement) and gate the whole payment on BILL_PAYMENT_GL_POSTING_ENABLED — it must
// never regress to decrementing the bank with no offsetting JE, and the atomic poster
// (postSourceTransactionInClientTx) must exist so the bank cache and GL can never diverge.
//
// VEND-F-VENDOR-BILL-PAYMENT-NEVER-POSTS-GL (GO-0009 G1) — this guard originally checked ONLY
// bills.service.ts's payBill() (the PayBillModal path). Two OTHER bill-payment writers
// (VendorDetail's `POST /vendors/:id/bill-payments`, VendorBalances' `POST /ap/bill-payments`)
// existed with zero poster call for however long, undetected, because nothing checked them. Now
// all three known bill-payment INSERT sites are covered — a future fourth site still would not be
// caught automatically; if one is added, add it to WRITERS below.
//
// Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";

import { maskComments } from "./lib/mask-comments.mjs";

/**
 * CLS-GUARD-READS-COMMENTS, yet another instance (Lead, 2026-09-30). Caught by mutation-testing my
 * own fix rather than by trusting it: I deleted the `await postSourceTransactionInClientTx(` call
 * from the delegated service and this guard STILL printed PASS — because the file carries a COMMENT
 * at line ~118 that names the same function. The guard was reading prose and calling it proof.
 *
 * Comments are masked before any assertion runs. Masking is offset-preserving, so every index-based
 * extractor above keeps working.
 */
function read(rel) { return maskComments(fs.readFileSync(path.join(ROOT, rel), "utf8")); }

/** Body of `export async function payBill(...)` up to the next top-level export. */
function payBillBody(src) {
  const start = src.search(/export\s+async\s+function\s+payBill\s*\(/);
  if (start < 0) return "";
  const rest = src.slice(start + 8);
  const next = rest.search(/\nexport\s+(async\s+)?function\s/);
  const own = next < 0 ? rest : rest.slice(0, next);
  // ROUND 326 (CC-1): payBill delegates its transactional body to payBillRowInClientTx (shared with
  // payBillInClientTx); the gate + atomic post live there, so the contract is checked across both.
  if (!/payBillRowInClientTx\(/.test(own)) return own;
  const rs = src.search(/\nasync\s+function\s+payBillRowInClientTx\s*\(/);
  if (rs < 0) return own;
  const rrest = src.slice(rs + 1);
  const rnext = rrest.slice(1).search(/\n(?:export\s+)?(?:async\s+)?function\s/);
  return own + "\n" + (rnext < 0 ? rrest : rrest.slice(0, rnext + 1));
}

/**
 * FOLLOW-THE-DELEGATION (Lead, 2026-09-30). This guard was RED on origin/main, on BOTH assertions,
 * against a route that does post the JE correctly.
 *
 * WHY: routeHandlerBody() reads only the lines between `app.post("<path>"` and the next route
 * registration. `POST /api/v1/vendors/:id/bill-payments` is nine lines of auth and zod validation
 * that then calls applyVendorBillPaymentBatch(), and THAT function resolves
 * isBillPaymentGlPostingEnabled (line 147) and calls postSourceTransactionInClientTx (line 256), in
 * the same client transaction as the bank decrement. The property the guard exists to protect is
 * satisfied; the guard was looking one function too shallow.
 *
 * Left as it was, the only way to make it green would be to INLINE a service into a route handler —
 * the guard would have forced worse code to protect a property the code already had. A guard that
 * can only be satisfied by making the codebase worse is a defect in the guard.
 *
 * So the extractor now follows ONE level of delegation: if the handler body calls a function
 * defined in the same file, that function's body is appended to the text searched. One level, same
 * file, and only for calls that actually resolve to a definition here — it does not chase across
 * modules, because at that point it would stop being a static check and start being a call graph.
 */
function sameFileFunctionBody(src, name) {
  const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const start = src.search(re);
  if (start < 0) return "";
  const rest = src.slice(start);
  const next = rest.slice(1).search(/\n(?:export\s+)?(?:async\s+)?function\s/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** Body of `app.post("<routePath>", ...)` up to the next `app.<verb>(` registration in the file. */
function routeHandlerBody(src, routePath) {
  const marker = `app.post("${routePath}"`;
  const start = src.indexOf(marker);
  if (start < 0) return "";
  const rest = src.slice(start + marker.length);
  const next = rest.search(/\n\s*app\.(get|post|put|patch|delete)\(/);
  const body = next < 0 ? rest : rest.slice(0, next);

  // Follow ONE named delegate, same file only. See FOLLOW-THE-DELEGATION above.
  //
  // NARROWED AFTER A FAILED MUTATION TEST. My first version appended EVERY same-file function whose
  // name appeared in the handler. That made the guard BLIND: I deleted the poster call from the
  // delegated service and the guard still printed PASS, because some other function in the file
  // carried the symbol. A guard that survives the removal of the thing it checks is worse than no
  // guard, so this now follows exactly ONE delegate — the awaited call the handler actually makes —
  // and nothing else.
  // Every identifier the handler CALLS that also has a `function <name>(` definition in this same
  // file, and nothing else. Not the first await (that is withCompanyScope, a helper from another
  // module), not every same-file function (that is what made this blind — see above).
  const called = [...new Set([...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]))];
  const extra = called.map((name) => sameFileFunctionBody(src, name)).join("\n");
  return body + extra;
}

const WRITERS = [
  {
    label: "bills.service.ts payBill()",
    file: "apps/backend/src/accounting/bills.service.ts",
    extract: (src) => payBillBody(src),
    notFound: (file) => `${file}: payBill() not found`,
    requireBlockedFlagOff: true,
  },
  {
    label: 'vendor-bill-payments.routes.ts POST /api/v1/vendors/:id/bill-payments',
    file: "apps/backend/src/accounting/vendor-bill-payments.routes.ts",
    extract: (src) => routeHandlerBody(src, "/api/v1/vendors/:id/bill-payments"),
    notFound: (file) => `${file}: POST /api/v1/vendors/:id/bill-payments handler not found`,
    requireBlockedFlagOff: false,
  },
  {
    label: "payment-application.routes.ts POST /api/v1/ap/bill-payments",
    file: "apps/backend/src/ap/payment-application.routes.ts",
    extract: (src) => routeHandlerBody(src, "/api/v1/ap/bill-payments"),
    notFound: (file) => `${file}: POST /api/v1/ap/bill-payments handler not found`,
    requireBlockedFlagOff: false,
  },
];

export function check() {
  const failures = [];
  let engine;
  try { engine = read(ENGINE); } catch { return [`${ENGINE} not found`]; }

  if (!/export\s+async\s+function\s+postSourceTransactionInClientTx/.test(engine)) {
    failures.push(`${ENGINE}: postSourceTransactionInClientTx (the atomic, caller-txn poster) must be exported — required so every bill-payment writer posts the JE + cache decrement in ONE transaction`);
  }

  for (const w of WRITERS) {
    let src;
    try { src = read(w.file); } catch { failures.push(`${w.file} not found`); continue; }
    const body = w.extract(src);
    if (!body) { failures.push(w.notFound(w.file)); continue; }
    if (!/isBillPaymentGlPostingEnabled/.test(body)) {
      failures.push(`${w.label}: must resolve isBillPaymentGlPostingEnabled (BILL_PAYMENT_GL_POSTING_ENABLED) to decide whether to post the JE`);
    }
    if (w.requireBlockedFlagOff && !/blocked_flag_off/.test(body)) {
      failures.push(`${w.label}: must surface gl_posting:"blocked_flag_off" when posting is disabled (no silent success)`);
    }
    if (!/postSourceTransactionInClientTx/.test(body)) {
      failures.push(`${w.label}: must post the bill_payment JE via postSourceTransactionInClientTx (atomic, same txn as the bank-cache decrement) — else the bank decrements with no offsetting JE (P1-BILLPAY-GL / VEND-F-VENDOR-BILL-PAYMENT-NEVER-POSTS-GL regression)`);
    }
    // The JE must be conditional on the flag — an UNCONDITIONAL post would 409/error every payment on the
    // OFF entities (GUARD 2026-07-11: BILL_PAYMENT_GL_POSTING is OFF for all entities in prod).
    if (/postSourceTransactionInClientTx/.test(body) && !/if\s*\(\s*(?:flags\.)?glPostingEnabled\s*(?:&&[^)]*)?\)/.test(body)) {
      failures.push(`${w.label}: must gate the JE post behind if(glPostingEnabled) so flag-OFF entities keep paying bills (no company-wide outage)`);
    }
  }
  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodPayBill = `export async function payBill(input, userId) { const glPostingEnabled = await isBillPaymentGlPostingEnabled(x,userId); return withCurrentUser(userId, async client => { insert(); updateBankBalance(client,-a); if (glPostingEnabled) { await postSourceTransactionInClientTx(client, {source_transaction_type:"bill_payment"}, {userId}); } return { ...p, gl_posting: glPostingEnabled ? "posted" : "blocked_flag_off" }; }); }`;
  const badPayBill = `export async function payBill(input, userId) { return withCurrentUser(userId, async client => { insert(); updateBankBalance(client,-a); return p; }); }`;
  const unconditionalPayBill = `export async function payBill(input, userId) { const glPostingEnabled = await isBillPaymentGlPostingEnabled(x,userId); return withCurrentUser(userId, async client => { insert(); updateBankBalance(client,-a); await postSourceTransactionInClientTx(client,{},{userId}); return { ...p, gl_posting: "blocked_flag_off" }; }); }`;
  const body = (s) => { const i = s.search(/export\s+async\s+function\s+payBill\s*\(/); return s.slice(i); };
  const gated = (s) => /if\s*\(\s*glPostingEnabled\s*(?:&&[^)]*)?\)/.test(body(s));
  const checks = [
    ["wired payBill (gate + conditional atomic post) passes", /isBillPaymentGlPostingEnabled/.test(body(goodPayBill)) && /postSourceTransactionInClientTx/.test(body(goodPayBill)) && /blocked_flag_off/.test(body(goodPayBill)) && gated(goodPayBill)],
    ["unwired payBill (bank mutated, no JE) is caught", !/postSourceTransactionInClientTx/.test(body(badPayBill))],
    ["UNCONDITIONAL post (would 409 OFF entities) is caught", /postSourceTransactionInClientTx/.test(body(unconditionalPayBill)) && !gated(unconditionalPayBill)],
  ];

  const goodRoute = `app.post("/api/v1/vendors/:id/bill-payments", {}, async (req, reply) => { const glPostingEnabled = await isBillPaymentGlPostingEnabled(x,y); for (const r of xs) { if (glPostingEnabled && !isQboBill) { await postSourceTransactionInClientTx(client, {source_transaction_type:"bill_payment"}, {userId}); } } });\napp.get("/next", {}, async () => {});`;
  const unwiredRoute = `app.post("/api/v1/vendors/:id/bill-payments", {}, async (req, reply) => { for (const r of xs) { await client.query("INSERT INTO accounting.bill_payments"); } });\napp.get("/next", {}, async () => {});`;
  const routeBody = (s) => routeHandlerBody(s, "/api/v1/vendors/:id/bill-payments");
  checks.push(
    ["wired route (gate + conditional atomic post) passes", /isBillPaymentGlPostingEnabled/.test(routeBody(goodRoute)) && /postSourceTransactionInClientTx/.test(routeBody(goodRoute)) && gated(goodRoute) === false && /if\s*\(\s*glPostingEnabled\s*(?:&&[^)]*)?\)/.test(routeBody(goodRoute))],
    ["unwired route (bank mutated, no JE) is caught", !/postSourceTransactionInClientTx/.test(routeBody(unwiredRoute))],
    ["route body extraction stops before the next app.get(", !routeBody(goodRoute).includes("/next")]
  );

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:bill-payment-posts-gl --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:bill-payment-posts-gl --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error("verify:bill-payment-posts-gl FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`verify:bill-payment-posts-gl PASS (all ${WRITERS.length} known bill-payment writers post an atomic gated JE; bank + GL cannot diverge)`);
}
