#!/usr/bin/env node
/**
 * ROUND 443.14 (Lead, 2026-10-10) — Book Load has ONE booking body, and it runs on the caller's client.
 *
 * Fails when, in apps/backend/src/dispatch/book-load.service.ts:
 *   1. bookLoadOnClient(client, input) is not exported;
 *   2. bookLoadOnClient opens a transaction of its own (withCurrentUser / withLuciaBypass / BEGIN /
 *      COMMIT / ROLLBACK) — the caller's rollback must undo the load;
 *   3. bookLoadOnClient runs an after-book extra directly instead of returning it as afterCommit;
 *   4. bookLoadOnClient skips the shared input checks, setScopedCompanyContext, or books through
 *      anything but createLoadWithFullSideEffects(..., { source: "live_feed" });
 *   5. bookLoad() is not the thin wrapper: checks before any DB access, bookLoadOnClient inside one
 *      withCurrentUser, afterCommit() only after that transaction returns;
 *   6. a second booking body (the old bookLoadInTransaction) reappears;
 *   7. any of the three after-book extras is called anywhere but queueAfterBookExtras.
 *
 *   node scripts/verify-book-load-on-client-caller-transaction.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const EXTRAS = ["autoCreateGeofencesForLoad(", "geocodeStopsBackfill(", "computeAndPersistGoogleReferenceMilesForLoad("];

function functionBody(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return null;
  const open = src.indexOf("{", src.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function check(src) {
  const errors = [];
  const onClient = functionBody(src, "export async function bookLoadOnClient(client: DbClient, input: BookLoadInput)");
  if (onClient == null) {
    errors.push("bookLoadOnClient(client, input) is not exported");
  } else {
    const code = stripComments(onClient);
    if (/withCurrentUser|withLuciaBypass|\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(code)) errors.push("bookLoadOnClient opens or ends a transaction of its own");
    for (const e of EXTRAS) if (code.includes(e)) errors.push(`bookLoadOnClient runs ${e.slice(0, -1)} directly — it must be returned as afterCommit`);
    if (!/afterCommit: \(\) => queueAfterBookExtras\(input, result\)/.test(code)) errors.push("bookLoadOnClient does not return the extras as afterCommit");
    if (!code.includes("bookLoadInputPrecheck(input)")) errors.push("bookLoadOnClient skips the shared input checks");
    if (!code.includes("setScopedCompanyContext(client, input.requestingUserUuid, input.operating_company_id)")) errors.push("bookLoadOnClient skips setScopedCompanyContext");
    if (!code.includes('createLoadWithFullSideEffects(client, input, { source: "live_feed" })')) errors.push("bookLoadOnClient does not book through createLoadWithFullSideEffects live_feed");
  }
  const wrapper = functionBody(src, "export async function bookLoad(input: BookLoadInput)");
  if (wrapper == null) {
    errors.push("bookLoad(input) is gone");
  } else {
    const code = stripComments(wrapper);
    const pre = code.indexOf("bookLoadInputPrecheck(input)");
    const tx = code.indexOf("withCurrentUser(");
    const inner = code.indexOf("bookLoadOnClient(client, input)");
    const after = code.lastIndexOf("afterCommit();");
    if (pre < 0 || tx < 0 || pre > tx) errors.push("bookLoad must run the input checks before opening its transaction");
    if (inner < 0 || inner < tx) errors.push("bookLoad must book through bookLoadOnClient inside its withCurrentUser");
    if (after < 0 || after < inner) errors.push("bookLoad must call afterCommit() after its transaction returns");
    if ((code.match(/withCurrentUser\(/g) ?? []).length !== 1) errors.push("bookLoad must open exactly one transaction");
    if (/createLoadWithFullSideEffects\(/.test(code)) errors.push("bookLoad books directly instead of through bookLoadOnClient");
  }
  if (/function bookLoadInTransaction\b/.test(src)) errors.push("a second booking body (bookLoadInTransaction) exists");
  const extrasFn = functionBody(src, "function queueAfterBookExtras(");
  const outside = extrasFn == null ? stripComments(src) : stripComments(src.replace(extrasFn, ""));
  for (const e of EXTRAS) if (outside.includes(e)) errors.push(`${e.slice(0, -1)} is called outside queueAfterBookExtras`);
  return errors;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const plant = (from, to) => good.replace(from, to);
  const cases = [
    ["own transaction in bookLoadOnClient", plant("  await setScopedCompanyContext(client, input.requestingUserUuid, input.operating_company_id);\n  // Book Load", "  await client.query(\"BEGIN\");\n  await setScopedCompanyContext(client, input.requestingUserUuid, input.operating_company_id);\n  // Book Load")],
    ["extras run eagerly", plant("return { result, afterCommit: () => queueAfterBookExtras(input, result) };", "queueAfterBookExtras(input, result);\n  return { result, afterCommit: () => {} };")],
    ["checks skipped", plant("  const refused = bookLoadInputPrecheck(input);\n  if (refused) return { result: refused", "  const refused = null as BookLoadResult | null;\n  if (refused) return { result: refused")],
    ["wrapper books directly", plant("const booked = await bookLoadOnClient(client, input);", "const booked = { result: await createLoadWithFullSideEffects(client, input, { source: \"live_feed\" }), afterCommit: () => {} };")],
    ["afterCommit dropped", plant("  afterCommit();\n  return result;", "  return result;")],
    ["second body back", good + "\nasync function bookLoadInTransaction() {}\n"],
    ["extra called elsewhere", good + "\nfunction x() { void geocodeStopsBackfill(\"a\", \"b\", \"c\"); }\n"],
    ["not exported", plant("export async function bookLoadOnClient(", "async function bookLoadOnClient(")],
  ];
  let ok = check(good).length === 0;
  if (!ok) console.error("selftest: the real service must pass", check(good));
  for (const [name, planted] of cases) {
    if (planted === good) { console.error(`selftest: plant "${name}" did not apply`); ok = false; continue; }
    if (check(planted).length === 0) { console.error(`selftest: missed "${name}"`); ok = false; }
  }
  console.log(ok ? `verify-book-load-on-client-caller-transaction --selftest PASS (${cases.length} planted defects caught)` : "selftest FAIL");
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(fs.readFileSync(path.join(ROOT, SERVICE), "utf8"));
if (errors.length) {
  console.error("verify-book-load-on-client-caller-transaction FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("verify-book-load-on-client-caller-transaction PASS");
