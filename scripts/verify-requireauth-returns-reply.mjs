#!/usr/bin/env node
/**
 * An async Fastify handler that returns undefined after requireAuth() already sent the 401 makes Fastify try to reply
 * again: every unauthenticated request logs FST_ERR_REP_ALREADY_SENT + ERR_HTTP_HEADERS_SENT (seen live 2026-10-02 on
 * /api/v1/mdata/boards/*, /customers/:id/profile, /vendors/:id/profile). Return the reply (or null) instead.
 * Static, < 1 s. --selftest plants the double-send shape and the correct shapes (443.97).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The exact shape git grep searches for below (same pattern, as a JS regex). */
export const DOUBLE_SEND_RE = /if \(!requireAuth\([a-zA-Z]+, ?[a-zA-Z]+\)\) return;/;
/** Pure decision: the source lines that double-send after requireAuth already replied. */
export function doubleSendLines(lines) {
  return lines.filter((l) => DOUBLE_SEND_RE.test(l));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes("--selftest")) {
  const cases = [
    ["`if (!requireAuth(req, reply)) return;` is caught", doubleSendLines(["  if (!requireAuth(req, reply)) return;"]).length === 1],
    ["`if (!requireAuth(request,reply)) return;` (no space) is caught", doubleSendLines(["if (!requireAuth(request,reply)) return;"]).length === 1],
    ["`if (!requireAuth(req, reply)) return reply;` passes", doubleSendLines(["  if (!requireAuth(req, reply)) return reply;"]).length === 0],
    ["`if (!requireAuth(req, reply)) return null;` passes", doubleSendLines(["  if (!requireAuth(req, reply)) return null;"]).length === 0],
    ["an unrelated `return;` passes", doubleSendLines(["  if (!ok) return;"]).length === 0],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? "verify-requireauth-returns-reply --selftest FAIL" : `verify-requireauth-returns-reply --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

if (isMain) {
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-n", "-E", "if \\(!requireAuth\\([a-zA-Z]+, ?[a-zA-Z]+\\)\\) return;", "--", "apps/backend/src"], { encoding: "utf8" });
  } catch (e) {
    if (e.status === 1) { console.log("verify-requireauth-returns-reply: OK — no handler returns undefined after requireAuth sent the reply"); process.exit(0); }
    throw e;
  }
  const offenders = doubleSendLines(out.trim().split("\n"));
  console.error("verify-requireauth-returns-reply: FAIL — `if (!requireAuth(req, reply)) return;` double-sends; use `return reply;`:\n" + offenders.map((l) => "  " + l).join("\n"));
  process.exit(1);
}
