#!/usr/bin/env node
/**
 * BANK-ECON-04 / BANK-SURF-04 — honesty KEEP guard.
 *
 * PR #3454 merged the RLS root-cause fix + recon wiring; Neon-applied 202608030000.
 * Manifest may be:
 *   - qualifying HOLD while reconciliation_sessions=0, OR
 *   - PASS when evidence cites reconciliation_sessions=N with N>=1 (live smoke).
 *
 *   node scripts/verify-bank-econ-04-honesty-keep.mjs
 *   node scripts/verify-bank-econ-04-honesty-keep.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run as runRlsBypass } from "./verify-bank-accounts-rls-bypass-lucia.mjs";
import { run as runReconWiring } from "./verify-banking-recon-start-session-wired.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "docs/module-completion/banking.json";
const MARKDOWN = "docs/module-completion/banking.md";
const HELD = "db/migrations/.held-migrations.json";
const MIG_BASENAME = "202608030000_bank_accounts_rls_bypass_lucia.sql";
const INTEGRATION_TEST =
  "apps/backend/src/banking/__tests__/reconciliation-start-session-live-path.integration.test.ts";
const HOLD_IDS = ["BANK-ECON-04", "BANK-SURF-04"];
const TRACKER = "hold/bank-econ-04-recon-session-live-path-20260725";
const FUTURE_BLOCK = "BANK-ECON-04-NEON-APPLY";
const MEANINGFUL_SESSIONS = 1;

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function qualifiesHold(item) {
  return (
    item.status === "HOLD" &&
    item.owner_hold === true &&
    typeof item.tracker === "string" &&
    item.tracker.length > 0 &&
    typeof item.future_block === "string" &&
    item.future_block.length > 0
  );
}

function parseSessionsDensity(evidence) {
  const ev = String(evidence || "");
  const m = ev.match(/reconciliation_sessions\s*=\s*(\d+)/i);
  if (!m) return null;
  return Number(m[1]);
}

function sessionsMeaningful(evidence) {
  const n = parseSessionsDensity(evidence);
  return n != null && n >= MEANINGFUL_SESSIONS;
}

export function run(root = ROOT) {
  const failures = [];

  failures.push(...runRlsBypass(root));
  failures.push(...runReconWiring(root));

  const testPath = path.join(root, INTEGRATION_TEST);
  if (!fs.existsSync(testPath)) {
    failures.push(`missing live-path integration test ${INTEGRATION_TEST}`);
  } else {
    const testSrc = fs.readFileSync(testPath, "utf8");
    if (!/BANK-ECON-04|reconciliation start-session live path/i.test(testSrc)) {
      failures.push("integration test must cover BANK-ECON-04 reconciliation start-session live path");
    }
    if (!testSrc.includes("reconciliation_sessions")) {
      failures.push("integration test must assert reconciliation_sessions INSERT path");
    }
  }

  const heldPath = path.join(root, HELD);
  if (!fs.existsSync(heldPath)) {
    failures.push(`missing ${HELD}`);
  } else {
    const held = readJson(root, HELD);
    const inHeld = (held.held || []).find((h) => h.file === MIG_BASENAME);
    const inAppliedHeld = (held.applied_held || []).find((h) => h.file === MIG_BASENAME);
    if (!inHeld && !inAppliedHeld) {
      failures.push(`${MIG_BASENAME} must remain registered in .held-migrations.json (MERGED≠APPLIED)`);
    } else if (inHeld && inHeld.applied_on_prod === true) {
      failures.push(
        `${MIG_BASENAME} is applied_on_prod:true but still sits in held[] — move it to applied_held[]`
      );
    }
  }

  const manifestPath = path.join(root, MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    failures.push(`missing ${MANIFEST}`);
  } else {
    const data = readJson(root, MANIFEST);
    for (const id of HOLD_IDS) {
      const item = (data.items || []).find((it) => it.id === id);
      if (!item) {
        failures.push(`${MANIFEST} missing item ${id}`);
        continue;
      }
      const ev = String(item.evidence || "");
      if (!/202608030000/.test(ev)) {
        failures.push(`${id} evidence must cite migration 202608030000`);
      }
      if (!/#3454|MERGED/i.test(ev)) {
        failures.push(`${id} evidence must cite PR #3454 or MERGED`);
      }
      if (item.status === "PASS") {
        if (!sessionsMeaningful(ev)) {
          failures.push(
            `${id} PASS requires reconciliation_sessions=N with N>=${MEANINGFUL_SESSIONS} in evidence (Rule 23)`
          );
        }
      } else if (qualifiesHold(item)) {
        if (item.tracker !== TRACKER) {
          failures.push(`${id} tracker must remain ${TRACKER}`);
        }
        if (!String(item.future_block || "").includes(FUTURE_BLOCK)) {
          failures.push(`${id} future_block must name ${FUTURE_BLOCK}`);
        }
        if (sessionsMeaningful(ev)) {
          failures.push(`${id} evidence cites sessions>=1 but status is still HOLD — flip to PASS`);
        }
      } else {
        failures.push(`${id} must be PASS (sessions>=1) or qualifying HOLD`);
      }
    }
  }

  const mdPath = path.join(root, MARKDOWN);
  if (fs.existsSync(mdPath)) {
    const md = fs.readFileSync(mdPath, "utf8");
    const data = readJson(root, MANIFEST);
    for (const id of HOLD_IDS) {
      const item = (data.items || []).find((it) => it.id === id);
      const want = item?.status === "PASS" ? "PASS" : "HOLD";
      const rowRe = new RegExp(`\\| \`${id}\` \\| \\*\\*${want}\\*\\*`);
      if (!rowRe.test(md)) {
        failures.push(`${MARKDOWN} must show ${id} as ${want} (run verify-module-completion --write-md)`);
      }
    }
  }

  return failures;
}

function write(root, rel, contents) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

if (process.argv.includes("--selftest")) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-bank-econ-04-honesty-keep-"));

  const copyTree = (rel) => {
    const src = path.join(ROOT, rel);
    const dest = path.join(temp, rel);
    if (!fs.existsSync(src)) return;
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) copyTree(path.join(rel, name));
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  };

  for (const rel of [
    MANIFEST,
    MARKDOWN,
    HELD,
    "db/migrations/202608030000_bank_accounts_rls_bypass_lucia.sql",
    INTEGRATION_TEST,
    "apps/backend/src/index.ts",
    "apps/backend/src/banking/reconciliation.routes.ts",
    "apps/frontend/src/api/banking.ts",
    "apps/frontend/src/pages/banking/BankingHome.tsx",
    "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx",
    "apps/frontend/src/routes/manifest.tsx",
  ]) {
    copyTree(rel);
  }

  try {
    // Force HOLD shape for baseline selftest (repo may already be PASS).
    const base = readJson(temp, MANIFEST);
    for (const id of HOLD_IDS) {
      const it = base.items.find((i) => i.id === id);
      it.status = "HOLD";
      it.owner_hold = true;
      it.tracker = TRACKER;
      it.future_block = FUTURE_BLOCK;
      it.evidence =
        "Neon-apply pending. #3454 MERGED. mig 202608030000. reconciliation_sessions=0 until ops.";
    }
    write(temp, MANIFEST, JSON.stringify(base, null, 2) + "\n");
    write(
      temp,
      MARKDOWN,
      "| `BANK-ECON-04` | **HOLD** |\n| `BANK-SURF-04` | **HOLD** |\n"
    );

    const good = run(temp);
    if (good.length) throw new Error(`correct repo shape failed: ${good.join("; ")}`);

    const theater = readJson(temp, MANIFEST);
    theater.items.find((it) => it.id === "BANK-ECON-04").status = "PASS";
    theater.items.find((it) => it.id === "BANK-ECON-04").evidence =
      "theater PASS without sessions count #3454 202608030000 Neon";
    write(temp, MANIFEST, JSON.stringify(theater, null, 2) + "\n");
    if (!run(temp).some((f) => f.includes("BANK-ECON-04 PASS requires"))) {
      throw new Error("theater BANK-ECON-04 PASS without sessions=N was not detected");
    }

    const okPass = readJson(temp, MANIFEST);
    for (const id of HOLD_IDS) {
      const it = okPass.items.find((i) => i.id === id);
      it.status = "PASS";
      delete it.owner_hold;
      delete it.tracker;
      delete it.future_block;
      it.evidence =
        "LIVE Neon lucia reconciliation_sessions=2 (reconciled=1). #3454 MERGED. mig 202608030000.";
    }
    write(temp, MANIFEST, JSON.stringify(okPass, null, 2) + "\n");
    write(
      temp,
      MARKDOWN,
      "| `BANK-ECON-04` | **PASS** |\n| `BANK-SURF-04` | **PASS** |\n"
    );
    if (run(temp).length) throw new Error("meaningful sessions PASS wrongly rejected: " + run(temp).join("; "));

    const held = readJson(temp, HELD);
    held.held = held.held ?? [];
    held.held.push({ file: MIG_BASENAME, applied_on_prod: true, reason: "selftest: half-migrated shape" });
    write(temp, HELD, JSON.stringify(held, null, 2) + "\n");
    // reset manifest to HOLD so held check still runs cleanly after PASS path
    if (!run(temp).some((f) => f.includes("applied_on_prod"))) {
      throw new Error("applied_on_prod on a held[] (not applied_held[]) migration was not detected");
    }

    console.log("verify-bank-econ-04-honesty-keep --selftest OK");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = run();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(
    "verify-bank-econ-04-honesty-keep — OK (BANK-ECON-04/BANK-SURF-04 HOLD or meaningful sessions PASS)"
  );
}
