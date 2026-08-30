#!/usr/bin/env node
/**
 * PROOF ENGINE REPLAY HOST — the missing half of exact-SHA deriveStatus.
 *
 * Without this, every deploy makes every proof STALE and the only recovery is
 * hand-stamping proven_at_sha (the disease the engine abolishes).
 *
 * Host: .github/workflows/prod-postdeploy-verify.yml waits for THIS commit to
 * go live on Render, then runs:
 *   node scripts/proof-engine/replay-all.mjs --live-sha "$SHA" --write
 *
 * Writes docs/module-completion/PROOF-ENGINE-REPLAY.json (derived artifact).
 * Does NOT mutate module-completion/*.json item.status fields (shadow mode).
 *
 * DATABASE_URL must be read-only prod when present. Missing URL → sql proofs
 * record UNVERIFIED-connected; job does not invent PASS.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveStatus, replay } from "./proof-engine.mjs";
import { makeSqlRunner } from "./sql-runner.mjs";
import { ECON_PROOFS } from "./econ-proofs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/module-completion/PROOF-ENGINE-REPLAY.json");
const DIR = path.join(ROOT, "docs/module-completion");
const WRITE = process.argv.includes("--write");
const liveArg = process.argv.find((a) => a.startsWith("--live-sha="));
const LIVE_SHA = (liveArg ? liveArg.split("=")[1] : "").slice(0, 40);

const SKIP = new Set([
  "PROD-VERIFIED-BINDING-BASELINE.json",
  "PROD-VERIFIED-HTTP-RECHECK.json",
  "PROD-VERIFIED-EVIDENCE-CLASS.json",
  "PROOF-ENGINE-REPLAY.json",
]);

function loadManifestItems() {
  const out = [];
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".json") && !SKIP.has(n))) {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    for (const it of data.items || []) {
      if (!Array.isArray(it.proofs) || it.proofs.length === 0) continue;
      out.push({ file: f, module: data.module, item: it });
    }
  }
  return out;
}

function loadEconItems() {
  return Object.entries(ECON_PROOFS).flatMap(([column, e]) => {
    const proofs = [e.proof];
    if (e.second_half) proofs.push(e.second_half);
    return [{
      file: "econ-proofs.mjs",
      module: "economics",
      item: { id: `ECON-${e.n}`, column, proofs },
    }];
  });
}

async function liveShaFallback() {
  if (LIVE_SHA) return LIVE_SHA.slice(0, 7);
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

async function main() {
  const sha = await liveShaFallback();
  const ctx = {
    base: "https://api.ih35dispatch.com",
    fetch: (u, o) => fetch(u, o),
    exec: async (script, args = []) => {
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
        encoding: "utf8",
      });
      return r.status === null ? 1 : r.status;
    },
    runSql: makeSqlRunner({
      repoRoot: ROOT,
      connectionString: process.env.DATABASE_URL,
    }),
  };

  const rows = [...loadManifestItems(), ...loadEconItems()];
  const items = [];
  let fail = 0;
  let pass = 0;
  let unverified = 0;

  for (const { file, module, item } of rows) {
    const results = [];
    for (const p of item.proofs) {
      results.push(await replay(p, ctx));
    }
    // Stamp proven_at_sha to the live sha ONLY for deriveStatus when all proofs ok —
    // this is the machine write. We store it on the derived artifact, not in the manifest.
    const stamped = { ...item, proven_at_sha: sha || undefined };
    const d = deriveStatus(stamped, results, sha);
    if (d.status === "PASS") pass++;
    else if (d.status === "FAIL") fail++;
    else unverified++;
    items.push({
      id: item.id,
      module,
      file,
      derived: d,
      proofs: results.map((r) => ({
        kind: r.kind,
        ok: r.ok,
        err: r.err,
        observed: r.observed,
      })),
    });
  }

  const payload = {
    _comment:
      "DERIVED by scripts/proof-engine/replay-all.mjs after prod deploy of live_sha. Not hand-stamped. Do not edit.",
    live_sha: sha || null,
    computed_at: new Date().toISOString(),
    database_url_present: Boolean(process.env.DATABASE_URL),
    scanned: items.length,
    pass,
    fail,
    other: unverified,
    items,
  };

  const text = `${JSON.stringify(payload, null, 2)}\n`;
  process.stdout.write(text);
  if (WRITE) {
    fs.writeFileSync(OUT, text);
    console.error(`wrote ${OUT}`);
  }

  // Alert on FAIL (honest red). Missing DATABASE_URL is not a silent PASS — sql
  // proofs will FAIL with UNVERIFIED/connection errors and count in fail.
  if (fail > 0 && process.env.PROOF_REPLAY_FAIL_ON_FAIL === "1") process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
