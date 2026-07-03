#!/usr/bin/env node
/**
 * verify:qbo-sync-panels-credentialed — VENDOR-401 regression guard (frontend).
 *
 * Root cause of the vendors/status 401-on-valid-session defect: the QBO sync panel used a raw
 * `fetch()` for the /api/v1/qbo-sync/* status + action calls. A raw fetch omits `credentials:
 * "include"`, so the cross-origin `ih35_session` cookie is never sent and the backend's requireAuth
 * returns 401 — the banner shows "Unable to load sync status". The shared `apiRequest` client sends
 * credentials and targets the API host, so every sync panel MUST route qbo-sync calls through it.
 *
 * Contract enforced: each *SyncPanel.tsx component must
 *   (a) import `apiRequest` from the api client,
 *   (b) NOT import or use `resolveApiUrl`, and
 *   (c) contain no raw `fetch(` call.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PANEL_DIR = path.join(ROOT, "apps", "frontend", "src");

function fail(messages) {
  console.error("verify:qbo-sync-panels-credentialed — FAILED");
  for (const m of messages) console.error(`- ${m}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith("SyncPanel.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const panels = walk(PANEL_DIR);
if (panels.length === 0) {
  fail(["no *SyncPanel.tsx components found — guard target moved; update this script"]);
}

const problems = [];
for (const file of panels) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");

  if (!/\bimport\b[^\n]*\bapiRequest\b[^\n]*api\/client/.test(text)) {
    problems.push(`${rel}: must import apiRequest from the api client (credentialed fetch)`);
  }
  if (/\bresolveApiUrl\b/.test(text)) {
    problems.push(`${rel}: must NOT use resolveApiUrl — route qbo-sync calls through apiRequest so auth cookies are sent`);
  }
  // Any raw fetch( in a sync panel is a credential-omission risk (401 on valid session).
  const rawFetch = text.match(/(?<![.\w])fetch\s*\(/);
  if (rawFetch) {
    problems.push(`${rel}: raw fetch() is not allowed in a sync panel — use apiRequest (sends credentials: include)`);
  }
}

if (problems.length > 0) fail(problems);

console.log(`verify:qbo-sync-panels-credentialed — OK (${panels.length} sync panels checked)`);
