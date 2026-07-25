#!/usr/bin/env node
/**
 * BANK-ECON-04 / BANK-SURF-04 — honesty KEEP guard (MERGED≠APPLIED on Neon).
 *
 * PR #3454 merged the RLS root-cause fix + recon wiring to main, but
 * db/migrations/202608030000_bank_accounts_rls_bypass_lucia.sql is HELD — owner
 * Neon-apply required before reconciliation_sessions can go > 0 on prod.
 *
 * This guard FAILs if:
 *   - the RLS bypass migration or recon start-session wiring regresses (delegates
 *     to verify-bank-accounts-rls-bypass-lucia + verify-banking-recon-start-session-wired)
 *   - BANK-ECON-04 or BANK-SURF-04 is flipped to PASS/FAIL without qualifying HOLD
 *   - held migration is marked applied_on_prod (would falsely imply Neon live)
 *   - evidence drops MERGED≠APPLIED honesty (#3454 / 202608030000 / Neon-apply)
 *
 * Does NOT require reconciliation_sessions>0 — that is the future BANK-ECON-04-NEON-APPLY block.
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
    // 2026-07-25 GUARD registry split: a migration Neon-applied and ledger-verified moves to
    // applied_held[] (owner-confirmed live proof), not held[]. applied_on_prod:true there is the
    // EXPECTED state — only a held[] entry flagged applied is the contradictory half-migrated shape.
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
      if (item.status === "PASS") {
        failures.push(
          `${id} must stay HOLD until Neon apply — PASS is theater while reconciliation_sessions=0 (Rule 23)`
        );
      }
      if (!qualifiesHold(item)) {
        failures.push(`${id} must be qualifying HOLD (status HOLD + owner_hold + tracker + future_block)`);
      }
      if (item.tracker !== TRACKER) {
        failures.push(`${id} tracker must remain ${TRACKER}`);
      }
      if (!String(item.future_block || "").includes(FUTURE_BLOCK)) {
        failures.push(`${id} future_block must name ${FUTURE_BLOCK}`);
      }
      const ev = String(item.evidence || "");
      if (!/202608030000/.test(ev)) {
        failures.push(`${id} evidence must cite migration 202608030000`);
      }
      if (!/#3454|MERGED/i.test(ev)) {
        failures.push(`${id} evidence must cite PR #3454 or MERGED (MERGED≠APPLIED honesty)`);
      }
      if (!/Neon|neon/i.test(ev)) {
        failures.push(`${id} evidence must name owner Neon-apply blocker`);
      }
    }
  }

  const mdPath = path.join(root, MARKDOWN);
  if (!fs.existsSync(mdPath)) {
    failures.push(`missing ${MARKDOWN}`);
  } else {
    const md = fs.readFileSync(mdPath, "utf8");
    for (const id of HOLD_IDS) {
      const rowRe = new RegExp(`\\| \`${id}\` \\| \\*\\*HOLD\\*\\*`);
      if (!rowRe.test(md)) {
        failures.push(`${MARKDOWN} must show ${id} as HOLD (not PASS/FAIL)`);
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
    const good = run(temp);
    if (good.length) throw new Error(`correct repo shape failed: ${good.join("; ")}`);

    const manifest = readJson(temp, MANIFEST);
    manifest.items.find((it) => it.id === "BANK-ECON-04").status = "PASS";
    write(temp, MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    if (!run(temp).some((f) => f.includes("BANK-ECON-04 must stay HOLD"))) {
      throw new Error("flipped BANK-ECON-04 to PASS was not detected");
    }
    copyTree(MANIFEST);

    // The migration is legitimately in applied_held[] on the real repo (Neon-applied, ledger-verified
    // 2026-07-25) — applied_on_prod:true there is the EXPECTED state, not a defect. The contradictory
    // shape this selftest must still catch is the file sitting in held[] (not applied_held[]) while
    // ALSO flagged applied — a half-migrated registry entry the 2026-07-25 split should never produce.
    const held = readJson(temp, HELD);
    held.held = held.held ?? [];
    held.held.push({ file: MIG_BASENAME, applied_on_prod: true, reason: "selftest: half-migrated shape" });
    write(temp, HELD, JSON.stringify(held, null, 2) + "\n");
    if (!run(temp).some((f) => f.includes("applied_on_prod"))) {
      throw new Error("applied_on_prod on a held[] (not applied_held[]) migration was not detected");
    }

    console.log("verify-bank-econ-04-honesty-keep --selftest OK");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else {
  const failures = run();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-bank-econ-04-honesty-keep — OK (BANK-ECON-04/BANK-SURF-04 stay HOLD until Neon apply)");
}
