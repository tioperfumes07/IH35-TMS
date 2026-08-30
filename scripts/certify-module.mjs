#!/usr/bin/env node
/**
 * CERT-01 B1 — module certification artifact + STALE rule.
 *
 *   node scripts/certify-module.mjs --module=vendors
 *
 * Writes docs/certification/<module>.cert.json. FW 1–12 checks land in B2–B7.
 * B1 only: fetch live healthz, stamp sha, compute display verdict.
 *
 * THE RULE (no override flag, no exceptions):
 *   if norm(cert.sha) !== norm(live healthz/shallow version) → display STALE
 *   never CERTIFIED while SHAs diverge.
 *
 * Do not add package.json verify:* (Rule 17). Call this file directly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "certify-module";
const DEFAULT_HEALTHZ = "https://api.ih35dispatch.com/api/v1/healthz/shallow";

export function normalizeSha(value) {
  const hex = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "");
  if (hex.length < 7) return "";
  return hex.slice(0, 7);
}

/**
 * Display verdict. CERTIFIED in the file is ignored when the SHA is not live.
 * There is no override parameter and none may be added.
 */
export function displayCertVerdict(artifact, liveVersion) {
  const certSha = normalizeSha(artifact?.sha);
  const liveSha = normalizeSha(liveVersion);
  if (!certSha || !liveSha || certSha !== liveSha) return "STALE";
  const inner = artifact?.verdict;
  if (inner === "CERTIFIED" || inner === "INCOMPLETE" || inner === "STALE") return inner;
  return "INCOMPLETE";
}

export function buildArtifact({ moduleId, liveVersion, ranAt, leftoversOpen = null, items = {} }) {
  const sha = normalizeSha(liveVersion);
  const artifact = {
    module: moduleId,
    sha,
    healthz_version_at_run: sha,
    ran_at: ranAt,
    items,
    leftovers_open: leftoversOpen,
    verdict: "INCOMPLETE",
  };
  artifact.display_verdict = displayCertVerdict(artifact, liveVersion);
  return artifact;
}

async function fetchLiveVersion(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${LABEL}: healthz HTTP ${res.status}`);
    const body = await res.json();
    const version = body?.version;
    if (!version) throw new Error(`${LABEL}: healthz JSON missing version`);
    return String(version);
  } finally {
    clearTimeout(t);
  }
}

function parseArgs(argv) {
  const out = { moduleId: "vendors", healthz: DEFAULT_HEALTHZ, write: true };
  for (const a of argv) {
    if (a.startsWith("--module=")) out.moduleId = a.slice("--module=".length).trim();
    else if (a.startsWith("--healthz=")) out.healthz = a.slice("--healthz=".length).trim();
    else if (a === "--dry-run") out.write = false;
  }
  if (!/^[a-z0-9_-]+$/i.test(out.moduleId)) {
    throw new Error(`${LABEL}: invalid --module`);
  }
  return out;
}

function selftest() {
  const live = "5c82530abcdef";
  const stale = displayCertVerdict({ sha: "7d7bbbf", verdict: "CERTIFIED" }, live);
  if (stale !== "STALE") {
    console.error(`${LABEL} SELFTEST FAIL — CERTIFIED + other SHA must display STALE, got ${stale}`);
    process.exit(1);
  }
  const match = displayCertVerdict({ sha: "5c82530", verdict: "CERTIFIED" }, "5c82530");
  if (match !== "CERTIFIED") {
    console.error(`${LABEL} SELFTEST FAIL — matching SHA may keep CERTIFIED, got ${match}`);
    process.exit(1);
  }
  const incomplete = buildArtifact({
    moduleId: "vendors",
    liveVersion: "5c82530",
    ranAt: "2026-08-29T22:00:00-05:00",
  });
  if (incomplete.display_verdict !== "INCOMPLETE" || incomplete.verdict === "CERTIFIED") {
    console.error(`${LABEL} SELFTEST FAIL — B1 writer must not emit CERTIFIED`);
    process.exit(1);
  }
  const forced = displayCertVerdict({ sha: "aaaaaaaa", verdict: "CERTIFIED", override: true }, "bbbbbbb");
  if (forced !== "STALE") {
    console.error(`${LABEL} SELFTEST FAIL — override field must not prevent STALE`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4/4 STALE rule`);
  process.exit(0);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  selftest();
}

const args = parseArgs(process.argv.slice(2));
const liveVersion = await fetchLiveVersion(args.healthz);
const artifact = buildArtifact({
  moduleId: args.moduleId,
  liveVersion,
  ranAt: new Date().toISOString(),
});
const json = `${JSON.stringify(artifact, null, 2)}\n`;
if (args.write) {
  const dir = path.join(ROOT, "docs/certification");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${args.moduleId}.cert.json`);
  fs.writeFileSync(dest, json);
  console.log(`${LABEL} wrote ${path.relative(ROOT, dest)} display_verdict=${artifact.display_verdict} sha=${artifact.sha}`);
} else {
  process.stdout.write(json);
}
