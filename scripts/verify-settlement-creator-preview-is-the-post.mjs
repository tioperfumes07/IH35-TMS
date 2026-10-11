#!/usr/bin/env node
/**
 * GUARD — Lead ruling R14 (2026-10-11): PREVIEW = POST, permanently. The Settlement Creator preview runs the real post
 * (postSettlementCreatorInClientTx, the only post path — no dryRun branch) inside a savepoint it rolls back, and reports
 * the journal lines that post WROTE (read back by account before the rollback), not a projection. The rehearsal sends
 * invoices, so the customer email is queued on the same transaction (invoice-send.service.ts, authorized by the Lead)
 * and the preview refuses to rehearse when the transaction is not scoped to the company.
 * Run: node scripts/verify-settlement-creator-preview-is-the-post.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-preview-is-the-post";
const F = {
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  send: "apps/backend/src/accounting/invoice-send.service.ts",
};

export function problems(s) {
  const p = [];
  if (/dryRun/.test(s.creator)) p.push("the Creator still has a dryRun branch — a second code path that can drift from the post");
  const a = s.creator.indexOf("export async function previewSettlementCreatorThroughClose(");
  const body = a >= 0 ? s.creator.slice(a, a + 6000) : "";
  if (!/await postSettlementCreatorInClientTx\(client, actorUserId, draft, \{ rehearsal: true \}\)/.test(body)) p.push("the preview does not run the real post (rehearsal)");
  if (!/ROLLBACK TO SAVEPOINT settlement_creator_dry_run/.test(body)) p.push("the preview does not roll the rehearsal back");
  if (!/je\.created_at = now\(\)/.test(body) || !/postedLines = written\.rows\.map/.test(body)) p.push("the preview does not report the journal lines the post wrote");
  if (!/je_lines: lines,/.test(body)) p.push("the preview returns projected lines instead of the written ones");
  if (!/Preview is not scoped to this company — the rehearsal did not run\./.test(body)) p.push("the preview rehearses without the company scope (the customer email would leave the transaction)");
  if (!/if \(!preview\.can_post && !opts\.rehearsal\)/.test(s.creator)) p.push("the rehearsal flag does more than skip the up-front can_post refusal");
  if (!/scoped \? \(x: Parameters<typeof enqueueEmail>\[0\]\) => enqueueEmailWithClient\(client as never, x\) : enqueueEmail/.test(s.send)) p.push("invoice send does not queue the customer email on its own transaction when scoped");
  return p;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

function selftest() {
  const good = read();
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const plants = [
    ["creator", (x) => x + "\n// opts.dryRun"],
    ["creator", (x) => x.replace("{ rehearsal: true })", "{})")],
    ["creator", (x) => x.replace("    je_lines: lines,\n", "")],
    ["creator", (x) => x.replace("Preview is not scoped to this company — the rehearsal did not run.", "x")],
    ["send", (x) => x.replace("enqueueEmailWithClient(client as never, x)", "enqueueEmail(x)")],
  ];
  for (const [k, f] of plants) {
    const planted = f(good[k]);
    if (planted === good[k]) bad.push(`plant on ${k} did not apply`);
    else if (!problems({ ...good, [k]: planted }).length) bad.push(`plant on ${k} passed: ${f.toString().slice(0, 70)}`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(read());
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
