#!/usr/bin/env node
/**
 * An async Fastify handler that returns undefined after requireAuth() already sent the 401 makes Fastify try to reply
 * again: every unauthenticated request logs FST_ERR_REP_ALREADY_SENT + ERR_HTTP_HEADERS_SENT (seen live 2026-10-02 on
 * /api/v1/mdata/boards/*, /customers/:id/profile, /vendors/:id/profile). Return the reply (or null) instead.
 * Static, < 1 s.
 */
import { execFileSync } from "node:child_process";
let out = "";
try {
  out = execFileSync("git", ["grep", "-n", "-E", "if \\(!requireAuth\\([a-zA-Z]+, ?[a-zA-Z]+\\)\\) return;", "--", "apps/backend/src"], { encoding: "utf8" });
} catch (e) {
  if (e.status === 1) { console.log("verify-requireauth-returns-reply: OK — no handler returns undefined after requireAuth sent the reply"); process.exit(0); }
  throw e;
}
console.error("verify-requireauth-returns-reply: FAIL — `if (!requireAuth(req, reply)) return;` double-sends; use `return reply;`:\n" + out.trim().split("\n").map((l) => "  " + l).join("\n"));
process.exit(1);
