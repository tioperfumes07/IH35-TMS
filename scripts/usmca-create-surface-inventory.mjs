#!/usr/bin/env node
/**
 * USMCA CREATE-SURFACE INVENTORY — step 1 of the exhaustive creation harness.
 *
 * The owner's goal is that EVERY create-surface in the app successfully creates one real record in
 * USMCA. Before anything can be created, the set has to be known, and it has to be known from the code
 * rather than from anyone's memory of which screens exist.
 *
 * WHAT COUNTS AS A CREATE-SURFACE. There are 746 distinct POST endpoints, and most are not creates —
 * they are actions on something that already exists (`/:id/approve`, `/scan`, `/test-connection`).
 * Counting those as create-surfaces would inflate the denominator and make the coverage report a lie.
 * The classifier is therefore explicit and conservative, and every endpoint lands in exactly one bucket
 * so nothing is silently dropped:
 *
 *   create  — a POST to a COLLECTION path (no trailing `:param`, no action verb). `/api/v1/mdata/customers`
 *   action  — a POST that operates on an existing row or runs a process. `/:id/void`, `/scan`, `/export`
 *   nested  — a POST that creates a CHILD under an existing parent. `/loads/:id/stops` — still a create,
 *             but it needs a parent to exist first, so the harness must order it after its parent.
 *   infra   — auth, webhooks, feature flags, integrations plumbing. Not a business create-surface.
 *
 * The UI side is matched separately: the product vocabulary is locked to `+ Create` / `+ Book` (never
 * `+ New` / `+ Add`), which makes the frontend surfaces greppable with high precision.
 *
 * Usage: node scripts/usmca-create-surface-inventory.mjs [--json out.json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BE = join(ROOT, "apps/backend/src");
const FE = join(ROOT, "apps/frontend/src");

/** Trailing segments that mean "do a thing", not "create a thing". */
const ACTION_VERBS = new Set([
  "approve", "reject", "void", "cancel", "close", "reopen", "submit", "send", "resend", "retry",
  "scan", "sync", "refresh", "recompute", "rebuild", "export", "import", "preview", "validate",
  "verify", "test-connection", "reassign", "archive", "restore", "activate", "deactivate", "assign",
  "unassign", "acknowledge", "ack", "review", "post", "unpost", "reverse", "apply", "match", "unmatch",
  "categorize", "reconcile", "commit", "release", "dispatch", "start", "stop", "complete", "finish",
  "mark-oos", "mark-back-in-service", "bulk", "bulk-update", "merge", "split", "duplicate", "clone",
  "upload", "download", "generate", "render", "notify", "remind", "escalate", "resolve", "link",
  "unlink", "seed", "backfill", "migrate", "reset", "rotate", "revoke", "login", "logout", "refresh-token",
  "search", "lookup", "resolve-name", "batch", "process", "run", "trigger", "enqueue", "replay",
]);

const INFRA_PREFIXES = [
  "/api/auth", "/api/v1/auth", "/api/feature-flags", "/api/v1/feature-flags", "/api/webhooks",
  "/api/v1/webhooks", "/api/integrations", "/api/v1/integrations", "/api/v1/samsara", "/api/samsara",
  "/api/v1/qbo", "/api/qbo", "/api/v1/sync", "/api/sync", "/api/v1/admin", "/api/admin",
  "/api/v1/healthz", "/api/healthz", "/api/v1/dev", "/api/dev",
];

const POST_RE = /app\.post\(\s*(["'`])([^"'`]+)\1/g;

function walk(dir, out = [], filter = /\.ts$/) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e === "node_modules" || e === "dist") continue;
      walk(p, out, filter);
    } else if (filter.test(e) && !/\.(test|spec)\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

function lastSegment(path) {
  const segs = path.split("/").filter(Boolean);
  return segs[segs.length - 1] ?? "";
}

export function classify(path) {
  if (INFRA_PREFIXES.some((p) => path.startsWith(p))) return "infra";
  const last = lastSegment(path);
  if (last.startsWith(":")) return "action"; // POST straight onto an id is never a create
  if (ACTION_VERBS.has(last)) return "action";
  // A collection POST nested under a parent id creates a CHILD — real create, but ordered.
  const hasParentParam = /\/:[a-z_]+\//i.test(path);
  return hasParentParam ? "nested" : "create";
}

const endpoints = [];
for (const file of walk(BE)) {
  const src = readFileSync(file, "utf8");
  POST_RE.lastIndex = 0;
  let m;
  while ((m = POST_RE.exec(src)) !== null) {
    const path = m[2];
    endpoints.push({
      path,
      kind: classify(path),
      file: relative(ROOT, file),
      line: src.slice(0, m.index).split("\n").length,
    });
  }
}

// Product vocabulary is LOCKED to "+ Create" / "+ Book" — never "+ New" / "+ Add" — which makes the UI
// side greppable with high precision instead of guesswork.
const CREATE_LABEL = /\+\s*(Create|Book)\b/;
const uiSurfaces = [];
for (const file of walk(FE, [], /\.tsx$/)) {
  const src = readFileSync(file, "utf8");
  if (!CREATE_LABEL.test(src)) continue;
  const labels = [...src.matchAll(/\+\s*(?:Create|Book)[^<"'`\n]{0,40}/g)].map((x) => x[0].trim());
  uiSurfaces.push({ file: relative(ROOT, file), labels: [...new Set(labels)].slice(0, 6) });
}

const byKind = endpoints.reduce((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {});
const creates = endpoints.filter((e) => e.kind === "create");
const nested = endpoints.filter((e) => e.kind === "nested");

const report = {
  measured_at_note: "counts are derived from code, not memory; classify() puts every endpoint in exactly one bucket",
  total_post_endpoints: endpoints.length,
  by_kind: byKind,
  create_surfaces: creates.sort((a, b) => a.path.localeCompare(b.path)),
  nested_create_surfaces: nested.sort((a, b) => a.path.localeCompare(b.path)),
  ui_create_surfaces: uiSurfaces.sort((a, b) => a.file.localeCompare(b.file)),
};

const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx !== -1) {
  writeFileSync(process.argv[jsonIdx + 1], `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`POST endpoints: ${endpoints.length}`);
console.log(`  create (collection):     ${byKind.create ?? 0}`);
console.log(`  nested create (child):   ${byKind.nested ?? 0}`);
console.log(`  action (not a create):   ${byKind.action ?? 0}`);
console.log(`  infra (not a surface):   ${byKind.infra ?? 0}`);
console.log(`UI files with a "+ Create"/"+ Book" surface: ${uiSurfaces.length}`);
