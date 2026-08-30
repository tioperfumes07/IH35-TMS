#!/usr/bin/env node
/**
 * 10142 — module completion requires TIEOUT (bar-2) + folded copy-integrity checks.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertManifestShape,
  assertTieoutCompleteGate,
  TIEOUT_REQUIRED_MODULES,
} from "./verify-module-completion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");

function schemaHasTieout() {
  const t = fs.readFileSync(path.join(ROOT, "docs/module-completion/SCHEMA.md"), "utf8");
  return (
    /Item class `TIEOUT`/.test(t) &&
    /bar_version/.test(t) &&
    /Unverified flags are not a population filter/.test(t)
  );
}

const FLAG_FILTER_RE =
  /\bis_sample_data\b|\bis_duplicate\b|\baccounting_bill_id\s*IS\s+NOT\s+NULL/i;

function tieoutScriptsMustNotTrustFlags() {
  const dir = path.join(ROOT, "scripts/tieout");
  const failures = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".mjs") && n !== "_lib.mjs")) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    if (FLAG_FILTER_RE.test(t)) {
      failures.push(`scripts/tieout/${f}: auto_check must not filter on unverified flags`);
    }
  }
  return failures;
}

function gateInVerifier() {
  const t = fs.readFileSync(path.join(ROOT, "scripts/verify-module-completion.mjs"), "utf8");
  return t.includes("assertTieoutCompleteGate") && t.includes("TIEOUT_REQUIRED_MODULES");
}

function run() {
  const failures = [];
  if (!schemaHasTieout()) failures.push("SCHEMA.md lost TIEOUT class / bar_version");
  if (!gateInVerifier()) failures.push("verify-module-completion.mjs lost TIEOUT gate");
  for (const mod of TIEOUT_REQUIRED_MODULES) {
    const p = path.join(ROOT, "docs/module-completion", `${mod}.json`);
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    const has = (data.items || []).some((it) => it.class === "TIEOUT");
    if (!has) failures.push(`${mod}.json missing TIEOUT item`);
    if (data.complete === true) {
      const g = assertTieoutCompleteGate(`${mod}.json`, data);
      failures.push(...g);
    }
  }
  failures.push(...tieoutScriptsMustNotTrustFlags());
  return failures;
}

function selftest() {
  const failures = [];
  if (!schemaHasTieout()) failures.push("SCHEMA missing TIEOUT on real tree");
  const plantedSchema = !/Item class `TIEOUT`/.test("nope");
  if (!plantedSchema) {
    // plant: empty schema text
    const fake = "";
    if (/Item class `TIEOUT`/.test(fake) === false) {
      /* expected */
    }
  }
  const planted = assertTieoutCompleteGate("factoring.json", {
    module: "factoring",
    complete: true,
    items: [
      {
        id: "FACT-S01",
        title: "t",
        layers: ["DOD-A"],
        spec: "s",
        status: "PASS",
        evidence: "e",
        prod_verified: true,
      },
    ],
  });
  if (!planted.some((x) => x.includes("no TIEOUT"))) {
    failures.push("planted complete without TIEOUT not caught");
  }
  const shape = assertManifestShape(
    "x.json",
    {
      module: "banking",
      complete: false,
      items: [
        {
          id: "BANK-TIEOUT-01",
          class: "TIEOUT",
          bar_version: 2,
          title: "t",
          layers: ["TIEOUT"],
          spec: "s",
          status: "OPEN",
          evidence: "e",
          external_source: "s",
          expected: { a: 1 },
          auto_check: "scripts/tieout/bank-ledger-closing.mjs",
          tolerance_cents: 3,
        },
      ],
    },
    { openWaveIds: [] }
  );
  if (!shape.some((x) => x.includes("owner_tolerance_note"))) {
    failures.push("planted non-zero tolerance not caught");
  }
  const copy = spawnSync(process.execPath, [path.join(ROOT, "scripts/verify-intercompany-copy-integrity.mjs"), "--selftest"], {
    encoding: "utf8",
  });
  if (copy.status !== 0) {
    failures.push("copy-integrity --selftest failed:\n" + (copy.stdout || "") + (copy.stderr || ""));
  }
  if (!FLAG_FILTER_RE.test("WHERE is_sample_data = false")) {
    failures.push("flag-filter regex does not catch is_sample_data");
  }
  if (failures.length) {
    console.error("verify-module-completion-requires-tieout --selftest FAIL", failures);
    process.exit(1);
  }
  console.log("verify-module-completion-requires-tieout --selftest: PASS");
}

if (SELFTEST) selftest();
else {
  const fails = run();
  if (fails.length) {
    console.error("verify-module-completion-requires-tieout: FAIL");
    for (const f of fails) console.error("  -", f);
    process.exit(1);
  }
  console.log("verify-module-completion-requires-tieout: PASS");
}
