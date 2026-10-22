#!/usr/bin/env node
/**
 * LEAD 443.237 — "no route sends after a 401". After every pod boot (stale cookies) three routes logged ERR_HTTP_HEADERS_SENT +
 * FST_ERR_REP_ALREADY_SENT: the auth helper sent the 401 and the async handler returned undefined while the app's async onSend
 * hooks were still running, so Fastify sent again. ~1,950 handlers share the `if (!user) return;` shape.
 * THE RULE: auth/reply-already-sent-guard.ts marks a sending reply in a first synchronous onSend hook and wraps every route so an
 * undefined result on a sending reply returns the reply; index.ts installs it BEFORE the first route is registered (an onRoute
 * hook only sees routes added after it).
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = { guard: "apps/backend/src/auth/reply-already-sent-guard.ts", index: "apps/backend/src/index.ts" };
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  if (!/app\.addHook\("onSend", \(_req, reply, payload, done\) => \{\s*\(reply as unknown as Record<symbol, unknown>\)\[REPLY_SENDING\] = true;\s*done\(null, payload\);/.test(s.guard))
    p.push(`${F.guard}: the first onSend hook must mark the reply as sending`);
  if (!/app\.addHook\("onRoute",[\s\S]*?if \(result === undefined && replyIsSending\(reply\)\) return reply;/.test(s.guard))
    p.push(`${F.guard}: every route must return the reply when it resolves undefined on a sending reply`);
  const install = s.index.indexOf("installReplyAlreadySentGuard(app);");
  if (install < 0) p.push(`${F.index}: installReplyAlreadySentGuard(app) is not called`);
  const firstRoute = s.index.search(/\bapp\.(get|post|put|patch|delete)\(|await register[A-Z]\w*\(app/);
  if (install >= 0 && firstRoute >= 0 && install > firstRoute)
    p.push(`${F.index}: installReplyAlreadySentGuard(app) must run before the first route (onRoute only sees later routes)`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["guard not installed", { index: base.index.replace("installReplyAlreadySentGuard(app);", "") }],
    ["guard installed after a route", { index: base.index.replace("installReplyAlreadySentGuard(app);", "").replace("attachHttpErrorMonitor(app);", "attachHttpErrorMonitor(app);\napp.get(\"/x\", async () => 1);\ninstallReplyAlreadySentGuard(app);") }],
    ["wrapper no longer returns the reply", { guard: base.guard.replace("if (result === undefined && replyIsSending(reply)) return reply;", "") }],
    ["sending mark removed", { guard: base.guard.replace("[REPLY_SENDING] = true;\n    done(null, payload);", "\n    done(null, payload);") }],
  ];
  for (const [n, src] of plants) {
    const k = Object.keys(src)[0];
    if (src[k] === base[k]) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-no-route-sends-after-401: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-no-route-sends-after-401: OK — the reply guard is installed before every route.");
}
