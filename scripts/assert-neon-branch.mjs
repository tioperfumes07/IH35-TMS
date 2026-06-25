#!/usr/bin/env node
/**
 * PRE-WRITE BRANCH ASSERTION (hard control — incident 2026-06-24).
 *
 * neonctl `connection-string --branch-id <X>` can return a DIFFERENT branch's endpoint host than asked for
 * (it returned the PROD endpoint for a test-branch id). Glancing at the host is NOT enough. This guard
 * resolves the connection's endpoint host to its branch via the **Neon API** (the source of truth) and
 * EXITS NON-ZERO if that branch != the expected branch id — so it can gate any write:
 *
 *   DATABASE_URL="$URL" node scripts/assert-neon-branch.mjs --expect-branch br-xxxx \
 *     && psql "$URL" -v ON_ERROR_STOP=1 -f db/migrations/<migration>.sql
 *
 * The `&&` means a mismatch aborts the write. Use it before EVERY prod-or-branch DDL/seed apply.
 *
 * Inputs:
 *   DATABASE_URL | DATABASE_DIRECT_URL   the connection whose target branch is being verified
 *   --expect-branch <branch_id>          REQUIRED — the branch id you intend to write to (e.g. a test branch)
 *   --project-id <id>                    default: tiny-field-89581227 (IH35-TMS)
 *   Neon token: NEON_API_KEY env, else neonctl credentials.json (access_token)
 *
 * Exit 0 = verified match (safe to write). Exit 1 = MISMATCH or could-not-verify (ABORT — do not write).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";

const argv = process.argv.slice(2);
const getArg = (n) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); if (a) return a.split("=").slice(1).join("="); const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const expectBranch = getArg("expect-branch");
const projectId = getArg("project-id") || "tiny-field-89581227";

function fail(msg) { console.error(`✘ assert-neon-branch: ${msg}`); process.exit(1); }

if (!expectBranch) fail("--expect-branch <branch_id> is required.");
const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!cs) fail("DATABASE_URL (or DATABASE_DIRECT_URL) must be set.");

let host = "";
try { host = (new URL(cs.trim().replace(/^postgres(ql)?:\/\//i, "http://")).hostname || "").toLowerCase(); } catch { fail("could not parse a host from the connection string."); }
// Neon endpoint id = first dotted segment of the host (ep-xxxx). Strip a "-pooler" suffix if present.
const endpointIdFromHost = host.split(".")[0].replace(/-pooler$/, "");

function neonToken() {
  if (process.env.NEON_API_KEY) return process.env.NEON_API_KEY;
  const candidates = [
    path.join(os.homedir(), ".config/neonctl/credentials.json"),
    path.join(os.homedir(), "Library/Application Support/neonctl/credentials.json"),
  ];
  for (const p of candidates) { try { return JSON.parse(fs.readFileSync(p, "utf8")).access_token; } catch { /* next */ } }
  return null;
}
const token = neonToken();
if (!token) fail("no Neon token (set NEON_API_KEY or log in with neonctl).");

function apiGet(p) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: "console.neon.tech", path: `/api/v2${p}`, method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, (res) => {
      let body = ""; res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(body) }); } catch (e) { reject(e); } });
    });
    req.on("error", reject); req.end();
  });
}

const res = await apiGet(`/projects/${projectId}/endpoints`).catch((e) => fail(`Neon API error: ${e.message}`));
if (res.status !== 200) fail(`Neon API returned ${res.status} for project ${projectId}.`);
const endpoints = res.json.endpoints || [];
const match = endpoints.find((e) => e.id === endpointIdFromHost || String(e.host || "").toLowerCase() === host);
if (!match) fail(`endpoint "${endpointIdFromHost}" not found in project ${projectId} — cannot verify the target branch. ABORT.`);

if (match.branch_id !== expectBranch) {
  fail(`MISMATCH — connection endpoint ${match.id} maps to branch ${match.branch_id}, but you intended ${expectBranch}. ABORT the write.`);
}
console.log(`✅ assert-neon-branch: endpoint ${match.id} → branch ${match.branch_id} === expected ${expectBranch}. Safe to write.`);
process.exit(0);
