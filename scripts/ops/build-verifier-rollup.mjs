#!/usr/bin/env node
/**
 * Build V1–V6 verifier rollup — per-module WORST state. Never averages.
 *
 * LAW (same as scenario-tracker.service.ts): status is DERIVED at request time.
 * The API (`GET module-matrix?scope=system` → verifierRollup) is the live answer.
 * This CLI still writes docs/specs/scoreboard/verifier-rollup.json for --check / docs;
 * the matrix UI must not treat that file as live.
 *
 * --stdout  print JSON only (API spawn)
 * --check   committed file matches rebuild with that file's asOf + healthzSha
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ancestorCheck, fetchHealthzVersionSync } from "../lib/live-verified-stamps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COMPLETION = path.join(ROOT, "docs/module-completion");
const OUT = path.join(ROOT, "docs/specs/scoreboard/verifier-rollup.json");
const CHECK = process.argv.includes("--check");
const STDOUT = process.argv.includes("--stdout");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function worstOf(order, states) {
  for (const s of order) if (states.includes(s)) return s;
  return order[order.length - 1];
}

function parseDates(item) {
  const out = [];
  const at = item.live_verified_at;
  if (typeof at === "string" && at.trim()) {
    const t = Date.parse(at);
    if (Number.isFinite(t)) out.push(t);
  }
  const ev = typeof item.evidence === "string" ? item.evidence : "";
  for (const m of ev.matchAll(/(\d{4}-\d{2}-\d{2})/g)) {
    const t = Date.parse(m[1]);
    if (Number.isFinite(t)) out.push(t);
  }
  return out;
}

function loadModuleManifests() {
  const files = fs.readdirSync(COMPLETION).filter((f) => f.endsWith(".json") && !f.startsWith("PROD-VERIFIED-"));
  const manifests = [];
  for (const f of files) {
    const data = readJson(path.join(COMPLETION, f));
    const module = typeof data.module === "string" ? data.module : f.replace(/\.json$/, "");
    manifests.push({ file: f, module, items: Array.isArray(data.items) ? data.items : [] });
  }
  return manifests;
}

export function build(opts = {}) {
  const manifests = loadModuleManifests();
  const asOf = opts.asOf || new Date().toISOString();
  let healthzSha = opts.healthzSha;
  if (healthzSha === undefined) {
    try {
      healthzSha = fetchHealthzVersionSync();
    } catch {
      healthzSha = "";
    }
  }
  healthzSha = healthzSha || "";

  const evidence = readJson(path.join(COMPLETION, "PROD-VERIFIED-EVIDENCE-CLASS.json"));
  const httpRecheck = readJson(path.join(COMPLETION, "PROD-VERIFIED-HTTP-RECHECK.json"));

  const evidenceByModule = new Map();
  for (const bucket of ["prose", "browser", "http", "neon"]) {
    const rows = evidence.items?.[bucket] || [];
    for (const row of rows) {
      const mod = row.module;
      if (!mod) continue;
      if (!evidenceByModule.has(mod)) evidenceByModule.set(mod, { prose: 0, browser: 0, http: 0, neon: 0 });
      evidenceByModule.get(mod)[bucket] += 1;
    }
  }

  const httpByModule = new Map();
  for (const row of httpRecheck.rows || []) {
    const status = String(row.status || "");
    for (const tagged of row.items || []) {
      const mod = String(tagged).split(":")[0];
      if (!mod) continue;
      if (!httpByModule.has(mod)) httpByModule.set(mod, { dead: 0, alive: 0 });
      const slot = httpByModule.get(mod);
      if (status === "NOT_FOUND") slot.dead += 1;
      else if (status === "MOUNTED_AUTH" || status === "HTTP_OK") slot.alive += 1;
    }
  }

  const modules = {};
  for (const { module, items } of manifests) {
    let stamped = 0;
    let unstamped = 0;
    const boundCounts = { no: 0, unknown: 0, yes: 0 };
    let provenTrue = 0;
    let provenFalse = 0;
    const ages = [];

    for (const it of items) {
      const sha = typeof it.live_verified_sha === "string" ? it.live_verified_sha.trim() : "";
      if (sha) stamped += 1;
      if (it.prod_verified === true && !sha) unstamped += 1;
      if (it.prod_verified === true) provenTrue += 1;
      else provenFalse += 1;

      if (sha && healthzSha) {
        const v = ancestorCheck(ROOT, sha, healthzSha);
        boundCounts[v] += 1;
      } else if (sha && !healthzSha) {
        boundCounts.unknown += 1;
      }

      ages.push(...parseDates(it));
    }

    let l6State = "none";
    if (items.length === 0) l6State = "none";
    else if (unstamped > 0) l6State = "unstamped";
    else if (stamped > 0) l6State = "stamped";
    else l6State = "none";

    const boundState =
      items.length === 0 || stamped === 0
        ? "unknown"
        : worstOf(["no", "unknown", "yes"], [
            boundCounts.no ? "no" : null,
            boundCounts.unknown ? "unknown" : null,
            boundCounts.yes ? "yes" : null,
          ].filter(Boolean));

    const provenState = items.length === 0 ? "none" : provenFalse > 0 ? "false" : provenTrue > 0 ? "true" : "none";

    const ev = evidenceByModule.get(module) || { prose: 0, browser: 0, http: 0, neon: 0 };
    const evidenceState =
      ev.prose + ev.browser + ev.http + ev.neon === 0
        ? "none"
        : worstOf(["prose", "browser", "http", "neon"], [
            ev.prose ? "prose" : null,
            ev.browser ? "browser" : null,
            ev.http ? "http" : null,
            ev.neon ? "neon" : null,
          ].filter(Boolean));

    const http = httpByModule.get(module);
    let routeState = "none";
    let dead = 0;
    let alive = 0;
    if (!http) routeState = "none";
    else {
      dead = http.dead;
      alive = http.alive;
      if (dead > 0) routeState = "dead";
      else if (alive > 0) routeState = "alive";
      else routeState = "none";
    }

    let days = null;
    if (ages.length) {
      const oldest = Math.min(...ages);
      days = Math.floor((Date.parse(asOf) - oldest) / 86_400_000);
    }

    modules[module] = {
      l6: { state: l6State, stamped, unstamped },
      bound: { state: boundState, no: boundCounts.no, unknown: boundCounts.unknown, yes: boundCounts.yes },
      proven: { state: provenState, true: provenTrue, false: provenFalse },
      evidence_class: { state: evidenceState, ...ev },
      route_alive: { state: routeState, dead, alive, none: http ? 0 : 1 },
      proof_age: { days },
    };
  }

  return {
    asOf,
    healthzSha: healthzSha || null,
    modules,
  };
}

function stable(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

if (STDOUT) {
  process.stdout.write(stable(build()));
  process.exit(0);
}

if (CHECK) {
  if (!fs.existsSync(OUT)) {
    console.error("build-verifier-rollup --check FAIL — committed file missing");
    process.exit(1);
  }
  const committedText = fs.readFileSync(OUT, "utf8");
  let committed;
  try {
    committed = JSON.parse(committedText);
  } catch {
    console.error("build-verifier-rollup --check FAIL — committed file unparseable");
    process.exit(1);
  }
  const payload = build({
    healthzSha: committed.healthzSha || "",
    asOf: committed.asOf,
  });
  const text = stable(payload);
  if (committedText !== text) {
    console.error("build-verifier-rollup --check FAIL — committed verifier-rollup.json differs from rebuild");
    process.exit(1);
  }
  console.log("build-verifier-rollup --check OK");
  process.exit(0);
}

const payload = build();
const text = stable(payload);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`build-verifier-rollup wrote ${OUT} modules=${Object.keys(payload.modules).length}`);
