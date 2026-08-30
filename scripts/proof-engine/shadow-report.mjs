#!/usr/bin/env node
/**
 * SHADOW MODE — compare derived verdict vs typed flags. Always exit 0.
 * Does not call assertNoHandWrittenVerdict. Does not rewrite JSON.
 *
 *   node scripts/proof-engine/shadow-report.mjs
 *   node scripts/proof-engine/shadow-report.mjs --all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveStatus, replay } from "./proof-engine.mjs";
import { makeSqlRunner } from "./sql-runner.mjs";
import { makeExec } from "./make-exec.mjs";
import { makeDomRunner } from "./dom-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "docs/module-completion");
const ALL = process.argv.includes("--all");

/** GO-LAST-26 named leftover (2026-08-30). */
const LAST_26 = new Set([
  "ACCT-LINK-01", "ACCT-GATE-01",
  "ACCT-SURF-05", "ACCT-SURF-06", "ACCT-SURF-08", "ACCT-SURF-09",
  "ACCT-R-03", "ACCT-R-04", "ACCT-R-10", "ACCT-R-11", "ACCT-R-14", "ACCT-R-18", "ACCT-R-20", "ACCT-R-24",
  "BANK-ECON-04", "BANK-ECON-05", "BANK-SURF-04",
  "SAF-B16", "SAF-ORPH-01", "SAF-ORPH-02", "SAF-ORPH-05",
  "DRV-S04",
  "VEND-CERT-01",
  "FACT-VERIFY-01", "SETL-VERIFY-01", "USER-VERIFY-01",
]);

const SKIP = new Set([
  "PROD-VERIFIED-BINDING-BASELINE.json",
  "PROD-VERIFIED-HTTP-RECHECK.json",
  "PROD-VERIFIED-EVIDENCE-CLASS.json",
]);

function typedPv(item) {
  return item.prod_verified === true;
}

function loadItems() {
  const out = [];
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".json") && !SKIP.has(n))) {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const items = Array.isArray(data.items) ? data.items : [];
    for (const it of items) {
      if (!ALL && !LAST_26.has(it.id)) continue;
      out.push({ file: f, module: data.module, item: it });
    }
  }
  return out;
}

async function liveSha() {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch("https://api.ih35dispatch.com/api/v1/healthz/shallow", {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    const body = await res.json();
    return String(body?.version || "").slice(0, 7);
  } catch {
    return "";
  }
}

async function derivedFor(item, sha, ctx) {
  const proofs = Array.isArray(item.proofs) ? item.proofs : [];
  const results = [];
  for (const p of proofs) {
    results.push(await replay(p, ctx));
  }
  return deriveStatus(item, results, sha);
}

async function main() {
  const sha = await liveSha();
  const ctx = {
    base: "https://api.ih35dispatch.com",
    fetch: (u, o) => fetch(u, o),
    exec: makeExec(ROOT),
    runSql: makeSqlRunner({
      repoRoot: ROOT,
      connectionString: process.env.DATABASE_URL,
    }),
    runDom: makeDomRunner({
      fetch: (u, o) => fetch(u, o),
      session: process.env.IH35_DOM_SESSION || null,
    }),
  };
  const rows = loadItems();
  const disagreements = [];
  for (const { file, module, item } of rows) {
    const d = await derivedFor(item, sha, ctx);
    const typedStatus = String(item.status || "");
    const typedVerified = typedPv(item);
    const statusDiff = d.status !== typedStatus;
    const pvDiff = d.prod_verified !== typedVerified;
    if (!statusDiff && !pvDiff) continue;
    disagreements.push({
      id: item.id,
      module,
      file,
      typed: { status: typedStatus, prod_verified: typedVerified },
      derived: { status: d.status, prod_verified: d.prod_verified, why: d.why },
    });
  }
  const payload = {
    mode: "shadow",
    enforced: false,
    live_sha: sha || null,
    scope: ALL ? "all-manifest-items" : "GO-LAST-26",
    scanned: rows.length,
    disagreements: disagreements.length,
    items: disagreements,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(0);
}

main();
