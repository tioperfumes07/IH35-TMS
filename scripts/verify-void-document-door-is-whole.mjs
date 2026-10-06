#!/usr/bin/env node
// AUTH-400 (CC-1, 2026-10-05) — the void door is WHOLE: voidDocument reverses the GL AND stamps the document header, in the
// caller's transaction. It used to stamp only bills / bill payments: the bank-line undo and the settlement creator called
// it alone and left silent voids (ledger dead, header live — verify-void-is-whole Direction 1, 1,215 on the AUTH-400 run).
// And a customer payment's void stamp has ONE writer (payment-void-stamp.service.ts), used by every void door.
// static + plants (read-only).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_void_document_door_is_whole(); }
async function selftest_verify_void_document_door_is_whole() {
  const { runGuard, withTmpFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const rogue = withTmpFixture(
    {
      "apps/backend/src/accounting/void-document.service.ts": "// voidDocument without the family stamps\nexport async function voidDocument() {}",
      "apps/backend/src/accounting/rogue.ts": "await client.query(`UPDATE accounting.payments SET voided_at = now() WHERE id = $1`);",
    },
    ["apps/backend/src/accounting"],
    (tmp) => runGuard(me, { env: { VERIFY_ROOT: tmp } }),
  );
  reportSelftest("verify_void_document_door_is_whole", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "unstamped door + rogue payment-void writer fails", pass: statusOf(rogue) !== 0, detail: outputOf(rogue).slice(-200) },
  ]);
}

const LABEL = "verify-void-document-door-is-whole";
const ROOT = process.env.VERIFY_ROOT
  ? path.resolve(process.env.VERIFY_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOOR = "apps/backend/src/accounting/void-document.service.ts";
const WRITER = "apps/backend/src/accounting/payment-void-stamp.service.ts";
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

export function doorProblems(src) {
  const p = [];
  for (const fam of ["expense", "invoice", "factoring_advance"]) {
    if (!new RegExp(`stampDocumentVoided\\(client as never, \\{ operatingCompanyId: input\\.operatingCompanyId, family: "${fam}"`).test(src)) p.push(`voidDocument('${fam}') must stamp the header through stampDocumentVoided`);
  }
  if (!/await stampCustomerPaymentVoided\(client as never, \{ operatingCompanyId: input\.operatingCompanyId, paymentId: input\.id/.test(src)) p.push("voidDocument('customer_payment') must stamp through stampCustomerPaymentVoided");
  return p;
}

/** Files (other than the one writer) that write a customer payment's void stamp directly. */
export function rogueWriters(files) {
  const re = /UPDATE\s+accounting\.payments\s+SET\s+voided_at\s*=/i;
  return files.filter((f) => f.rel !== WRITER && !/__tests__|\.test\./.test(f.rel) && re.test(f.src)).map((f) => f.rel);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (e.endsWith(".ts")) out.push({ rel: path.relative(ROOT, full).split(path.sep).join("/"), src: readFileSync(full, "utf8") });
  }
  return out;
}

const door = read(DOOR);
const files = walk(path.join(ROOT, "apps/backend/src"));
const problems = [...doorProblems(door), ...rogueWriters(files).map((f) => `${f} writes accounting.payments voided_at directly — use stampCustomerPaymentVoided (the one writer)`)];
const plants = [
  ["invoice not stamped", doorProblems(door.replace('family: "invoice"', 'family: "x"')).length > 0],
  ["customer payment not stamped", doorProblems(door.replace("await stampCustomerPaymentVoided(client as never, { operatingCompanyId: input.operatingCompanyId, paymentId: input.id", "await Promise.resolve({ operatingCompanyId: input.operatingCompanyId, paymentId: input.id")).length > 0],
  ["a second payment void writer", rogueWriters([{ rel: "apps/backend/src/x.ts", src: "UPDATE accounting.payments SET voided_at = now()" }]).length === 1],
];
const missed = plants.filter(([, caught]) => !caught).map(([n]) => n);
if (problems.length || missed.length) {
  console.error(`${LABEL}: FAIL — ${[...problems, ...missed.map((n) => `plant '${n}' not caught`)].join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — voidDocument stamps expense/invoice/factoring_advance/customer_payment; one customer-payment void writer (${plants.length}/${plants.length} plants caught)`);
