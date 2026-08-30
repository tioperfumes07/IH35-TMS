#!/usr/bin/env node
/**
 * GUARD: every Relay integration route handler must set a per-route rate limit (the app registers
 * @fastify/rate-limit with global:false, so routes opt in). Locks CodeQL js/missing-rate-limiting
 * (high) on the owner-only Relay import/backfill/review endpoints — a DoS/abuse guard.
 *
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "apps/backend/src/integrations/relay-payments");
const FILES = ["relay-fuel-csv-import.routes.ts", "relay-fuel-backfill.routes.ts", "relay-deposit-review.routes.ts"];

/** Flag any app.get/post/put/patch/delete registration that does NOT carry a rateLimit config in its
 *  options object. We match the registration line and require `rateLimit` on the same line. */
function findUnlimited(src, file) {
  const errors = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*(["'`][^"'`]+["'`])\s*(,\s*\{[^)]*?\})?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const optsObj = m[3] ?? "";
    if (!/rateLimit\s*:/.test(optsObj)) {
      errors.push(`${file}: route ${m[2]} (${m[1].toUpperCase()}) has no rateLimit config`);
    }
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `app.get("/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {});
app.post("/x", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {});`;
  const bad = `app.get("/status", async (req, reply) => {});
app.post("/x", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {});`;
  if (findUnlimited(good, "g").length !== 0) { console.error("SELFTEST FAIL: good flagged", findUnlimited(good, "g")); process.exit(1); }
  if (findUnlimited(bad, "b").length === 0) { console.error("SELFTEST FAIL: bad passed"); process.exit(1); }
  if (!findUnlimited(bad, "b").some((error) => error.includes('/status') && error.includes('(GET)'))) {
    console.error("SELFTEST FAIL: unbounded status poll was not identified exactly");
    process.exit(1);
  }
  console.log("verify-relay-routes-rate-limited selftest OK — unbounded GET status poll rejected");
  process.exit(0);
}

let errors = [];
for (const f of FILES) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue; // review routes only exist once #2396 lands
  errors = errors.concat(findUnlimited(fs.readFileSync(p, "utf8"), f));
}
if (errors.length) {
  console.error("GUARD FAIL — Relay route(s) missing per-route rate limit (CodeQL js/missing-rate-limiting):");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-relay-routes-rate-limited OK — all Relay routes rate-limited");
