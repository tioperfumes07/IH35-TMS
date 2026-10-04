#!/usr/bin/env node
// verify-escrow-release-claim-and-floor — a driver's escrow release names its claim, is posted once per claim, and never
// leaves the trust below zero (Lead ruling 2026-10-04, escrow over-release on 2100-00-027 / -002 / -004).
//
// 2026-09-24 nine claimless $25 releases (source_id NULL) drew deposits that the settlement unwind then reversed in full
// (ACCT-F20260924/25, R-161): -$150 / -$50 / -$25. The database trigger trg_refuse_driver_escrow_gl_debit_balance refuses
// that at commit — a backstop. This guard holds the ENGINE to four refusals, each by name, each in the right place:
//   1. postEscrowTransactionOnClient: a release with no source_id throws escrow_release_requires_claim;
//   2. postEscrowTransactionOnClient: a release of a claim+amount already released returns the first (idempotent_replay)
//      BEFORE any journal entry is created;
//   3. recordEscrowPostingOnly: a release/forfeiture that leaves the account below zero throws
//      escrow_release_exceeds_held_balance BEFORE the escrow_postings INSERT;
//   4. the settlement unwind: deposits-minus-prior-releases for that settlement below the reversal throws
//      escrow_unwind_exceeds_held_for_settlement BEFORE it records the release.
// Behaviour is proven by apps/backend/src/accounting/escrow/__tests__/service-balance-math.test.ts (over-balance refused,
// claimless refused, same claim twice = no-op). --selftest strips each refusal from the real source and must fail.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/escrow/service.ts";
const UNWIND = "apps/backend/src/driver-finance/settlement-payrun-subledger-unwind.service.ts";

function fnBody(src, header) {
  const start = src.indexOf(header);
  if (start < 0) return null;
  const next = src.indexOf("\nexport async function ", start + header.length);
  return src.slice(start, next < 0 ? src.length : next);
}

function check(service, unwind) {
  const bad = [];
  const post = fnBody(service, "export async function postEscrowTransactionOnClient(");
  if (!post) bad.push(`${SERVICE}: postEscrowTransactionOnClient not found (fails closed)`);
  else {
    const claim = post.indexOf('throw new Error("escrow_release_requires_claim")');
    const replay = post.indexOf("idempotent_replay");
    const je = post.indexOf("createJournalEntryOnClient(");
    if (claim < 0) bad.push("1. a claimless release is not refused (escrow_release_requires_claim)");
    if (replay < 0) bad.push("2. a repeated claim is not an idempotent no-op (idempotent_replay)");
    if (je < 0) bad.push(`${SERVICE}: postEscrowTransactionOnClient no longer creates its JE where expected (fails closed)`);
    if (claim >= 0 && je >= 0 && claim > je) bad.push("1. the claim refusal runs after the journal entry is created");
    if (replay >= 0 && je >= 0 && replay > je) bad.push("2. the idempotent replay runs after the journal entry is created");
  }
  const rec = fnBody(service, "export async function recordEscrowPostingOnly(");
  if (!rec) bad.push(`${SERVICE}: recordEscrowPostingOnly not found (fails closed)`);
  else {
    const floor = rec.indexOf("escrow_release_exceeds_held_balance");
    const ins = rec.indexOf("INSERT INTO accounting.escrow_postings");
    if (floor < 0) bad.push("3. recordEscrowPostingOnly records a release with no floor (escrow_release_exceeds_held_balance)");
    else if (ins >= 0 && floor > ins) bad.push("3. the floor runs after the escrow_postings INSERT");
  }
  const net = unwind.indexOf("escrow_unwind_exceeds_held_for_settlement");
  const call = unwind.indexOf("await recordEscrowPostingOnly(");
  if (net < 0) bad.push("4. the settlement unwind releases with no per-settlement net floor (escrow_unwind_exceeds_held_for_settlement)");
  else if (call >= 0 && net > call) bad.push("4. the per-settlement net floor runs after the release is recorded");
  return bad;
}

const service = readFileSync(join(ROOT, SERVICE), "utf8");
const unwind = readFileSync(join(ROOT, UNWIND), "utf8");

if (process.argv.includes("--selftest")) {
  const plants = [
    ["no claim refusal", service.replace('throw new Error("escrow_release_requires_claim")', 'void 0'), unwind],
    ["no idempotent replay", service.replaceAll("idempotent_replay", "replayed"), unwind],
    ["no account floor", service.replaceAll("escrow_release_exceeds_held_balance", "escrow_release_noted"), unwind],
    ["no unwind net floor", service, unwind.replaceAll("escrow_unwind_exceeds_held_for_settlement", "escrow_unwind_noted")],
  ];
  const live = check(service, unwind);
  const missed = plants.filter(([, s, u]) => check(s, u).length === 0).map(([n]) => n);
  if (live.length || missed.length) {
    console.error(`verify-escrow-release-claim-and-floor --selftest FAIL — live ${live.length} problem(s); plants not caught: ${missed.join(", ") || "none"}`);
    process.exit(1);
  }
  console.log(`verify-escrow-release-claim-and-floor --selftest PASS — ${plants.length}/${plants.length} planted removals caught, live clean`);
  process.exit(0);
}

const bad = check(service, unwind);
if (bad.length) {
  console.error(`verify-escrow-release-claim-and-floor FAIL —\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log("verify-escrow-release-claim-and-floor OK — release names its claim, a repeat is a no-op, the account floor and the per-settlement net floor refuse by name before anything posts");
