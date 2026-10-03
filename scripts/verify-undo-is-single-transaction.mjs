#!/usr/bin/env node
// ROUND 360 (CC-2) — INSTANT: every bank-line transition commits whole or not at all, inside the request. When the screen
// returns, the account balance is already right — no second connection, no after-commit post, no background job.
// Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md, hard requirement 1.
// Static, ceiling 0:
//   1. the state machine runs only on the caller's client: it never opens a connection or a transaction of its own
//      (withLuciaBypass / withCompanyScope / withCurrentUser / pool) and never posts through an own-connection poster;
//   2. it re-reads the line and THROWS unless it landed in For review, so a half-done undo rolls back;
//   3. bulk undo isolates each line in a SAVEPOINT (one line's failure never commits half of that line);
//   4. both undo routes and /unmatch call the engine inside ONE scope;
//   5. transfer create (incl. from a bank line), mark-as-transfer and revoke post their GL on the same client
//      (postTransferGlOnClient), never the after-commit maybePostTransferGl.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-undo-is-single-transaction";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "apps/backend/src/banking/bank-line-state-machine.service.ts";
const ROUTES_BULK = "apps/backend/src/banking/categorization.routes.ts";
const ROUTES_ONE = "apps/backend/src/banking/banking.routes.ts";
const UNMATCH = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";
const TRANSFERS = "apps/backend/src/banking/transfers.service.ts";

const strip = (src) => String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const fnBody = (src, sig) => {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  const rest = src.slice(i + sig.length);
  const j = rest.search(/\n(export )?(async )?function /);
  return src.slice(i, j > 0 ? i + sig.length + j : src.length);
};

export function check({ engine, bulk, one, unmatch, transfers }) {
  const f = [];
  const e = strip(engine);
  for (const bad of ["withLuciaBypass", "withCompanyScope", "withCurrentUser", "pool.connect", "luciaPool", "postSourceTransaction(", "maybePostTransferGl", "enqueue"]) {
    if (e.includes(bad)) f.push(`${ENGINE}: uses ${bad} — the engine must run only on the caller's client (one transaction)`);
  }
  if (!/throw new Error\(`bank_line_undo_left_line_in_/.test(engine)) f.push(`${ENGINE}: the post-transition re-read no longer throws (a half-done undo could commit)`);
  if (!/SAVEPOINT bank_line_undo[\s\S]{0,600}ROLLBACK TO SAVEPOINT bank_line_undo/.test(engine)) f.push(`${ENGINE}: bulk undo no longer isolates each line in a SAVEPOINT`);
  const bulkRoute = strip(bulk.slice(bulk.indexOf('"/api/v1/banking/transactions/undo-categorization"')));
  if (!/withCompanyScope\([\s\S]{0,200}undoBankLinesOnClient\(client/.test(bulkRoute)) f.push(`${ROUTES_BULK}: bulk undo must call undoBankLinesOnClient inside its one withCompanyScope`);
  const oneRoute = strip(one.slice(one.indexOf('"/api/v1/banking/transactions/:id/undo-categorization"')));
  if (!/withCompanyScope\([^)]*\)?[\s\S]{0,120}undoBankLineOnClient\(client/.test(oneRoute)) f.push(`${ROUTES_ONE}: single undo must call undoBankLineOnClient inside its one withCompanyScope`);
  const um = fnBody(unmatch, "export async function unmatchBankTransaction(") ?? "";
  if (!/withLuciaBypass\(async \(client\) => \{[\s\S]{0,300}undoBankLineOnClient\(client/.test(um)) f.push(`${UNMATCH}: /unmatch must run the engine inside its one withLuciaBypass`);
  const t = strip(transfers);
  for (const sig of ["export async function createTransfer(", "export async function markBankFeedLineAsTransfer(", "export async function revokeTransferInClient("]) {
    const b = fnBody(t, sig);
    if (!b) { f.push(`${TRANSFERS}: ${sig} not found`); continue; }
    if (/maybePostTransferGl\(/.test(b)) f.push(`${TRANSFERS}: ${sig.replace("export async function ", "")} posts after commit (maybePostTransferGl) — the GL must post on the same client`);
    if (!/postTransferGlOnClient\(/.test(b) && !/revokeTransferInClient\(/.test(b)) f.push(`${TRANSFERS}: ${sig.replace("export async function ", "")} no longer posts its GL on the same client`);
  }
  return f;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const real = () => ({ engine: read(ENGINE), bulk: read(ROUTES_BULK), one: read(ROUTES_ONE), unmatch: read(UNMATCH), transfers: read(TRANSFERS) });

if (process.argv.includes("--selftest")) {
  const r = real();
  const fails = [];
  if (check(r).length) fails.push(`tree not clean: ${check(r).join("; ")}`);
  const plants = [
    ["engine opens its own connection", { ...r, engine: r.engine + "\nexport async function x() { return withLuciaBypass(async () => 1); }\n" }],
    ["re-read no longer throws", { ...r, engine: r.engine.replace("throw new Error(`bank_line_undo_left_line_in_", "console.log(`bank_line_undo_left_line_in_") }],
    ["savepoint dropped", { ...r, engine: r.engine.replace('await client.query("ROLLBACK TO SAVEPOINT bank_line_undo");', "") }],
    ["transfer posts after commit", { ...r, transfers: r.transfers.replace("await postTransferGlOnClient(client, input.operatingCompanyId, created.id, userId, \"initial_post\");", "await maybePostTransferGl(input.operatingCompanyId, created.id, userId, \"initial_post\");") }],
  ];
  for (const [n, s] of plants) if (JSON.stringify(s) === JSON.stringify(r)) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const fails = check(real());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — the engine runs on the caller's client only, re-reads and throws on a stranded line, isolates each bulk line in a savepoint; both undo routes, /unmatch and every transfer path commit in one transaction`);
