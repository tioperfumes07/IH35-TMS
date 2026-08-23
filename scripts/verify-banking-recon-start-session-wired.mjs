#!/usr/bin/env node
/**
 * BANK-ECON-04 / BANK-SURF-04 — static pin for the reconciliation "start session" ACTIVE PATH.
 *
 * ROOT CAUSE (proven, not ops-empty): banking.reconciliation_sessions = 0 on prod was caused by a
 * missing RLS bypass escape on banking.bank_accounts (see
 * db/migrations/202608030000_bank_accounts_rls_bypass_lucia.sql) — every /start and /upload-statement
 * attempt resolved the bank account via withLuciaBypass's sentinel operating_company_id and 404'd
 * bank_account_not_found before a row could ever be inserted, on every attempt, for every operator.
 * apps/backend/src/banking/__tests__/reconciliation-start-session-live-path.integration.test.ts proves
 * the fix (and reproduces the pre-fix 404) against a real Postgres. This guard pins the STATIC chain a
 * future refactor could silently break without a live-DB test catching it in the same PR:
 *   - the backend route is mounted at boot (index.ts -> registerBankingReconciliationRoutes)
 *   - the exact POST /start path exists in the route file
 *   - the frontend API client posts to that exact path
 *   - BOTH operator entry points (BankingHome "+ Start first reconciliation"/"+ Reconcile" modal, and
 *     ReconciliationWorkspace inline "Create Session" form) call that client function — neither is a
 *     dead/disabled button with no onClick wired to the real request
 *   - the workspace route the operator lands on after starting a session is actually mounted
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const indexPath = "apps/backend/src/index.ts";
const backendRoutesPath = "apps/backend/src/banking/reconciliation.routes.ts";
const apiClientPath = "apps/frontend/src/api/banking.ts";
const bankingHomePath = "apps/frontend/src/pages/banking/BankingHome.tsx";
const workspacePath = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const reconPagePath = "apps/frontend/src/pages/banking/BankReconciliationPage.tsx";
const manifestPath = "apps/frontend/src/routes/manifest.tsx";

function read(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

export function run(rootDir = root) {
  const failures = [];
  const indexSrc = read(rootDir, indexPath);
  const backend = read(rootDir, backendRoutesPath);
  const apiClient = read(rootDir, apiClientPath);
  const bankingHome = read(rootDir, bankingHomePath);
  const workspace = read(rootDir, workspacePath);
  const reconPage = read(rootDir, reconPagePath);
  const manifest = read(rootDir, manifestPath);

  if (!indexSrc.includes('import { registerBankingReconciliationRoutes } from "./banking/reconciliation.routes.js";')) {
    failures.push("index.ts must import registerBankingReconciliationRoutes — otherwise the recon routes never register");
  }
  if (!indexSrc.match(/await\s+registerBankingReconciliationRoutes\(app\);/)) {
    failures.push("index.ts must call registerBankingReconciliationRoutes(app) at boot, or every recon route 404s silently");
  }

  if (!backend.includes('app.post("/api/v1/banking/reconciliation/start"')) {
    failures.push("reconciliation.routes.ts must expose POST /api/v1/banking/reconciliation/start — the button's endpoint");
  }
  if (!backend.includes("INSERT INTO banking.reconciliation_sessions")) {
    failures.push("the /start handler must actually INSERT a banking.reconciliation_sessions row (not a stub 200)");
  }

  if (!apiClient.match(/export function startReconciliationSession/)) {
    failures.push("api/banking.ts must export startReconciliationSession — the client fn every entry point depends on");
  }
  if (!apiClient.includes('`/api/v1/banking/reconciliation/start`')) {
    failures.push("startReconciliationSession must POST the exact mounted backend path");
  }

  const bankingHomeCallsStart = bankingHome.includes("void startReconciliationSession({");
  const bankingHomeHasEntryButtons =
    bankingHome.includes('ActionButton onClick={openStartReconciliation}>+ Start first reconciliation</ActionButton>') &&
    bankingHome.includes('ActionButton onClick={openStartReconciliation}>+ Reconcile</ActionButton>');
  if (!bankingHomeCallsStart) {
    failures.push("BankingHome.tsx must call startReconciliationSession — the Start-recon modal must submit the real request, not a no-op");
  }
  if (!bankingHomeHasEntryButtons) {
    failures.push("BankingHome.tsx must keep BOTH operator entry points ('+ Start first reconciliation' banner CTA and the Reconciliation tab '+ Reconcile' action) wired to openStartReconciliation — losing either silently strands operators with no path to start a session");
  }

  if (!workspace.includes("void startReconciliationSession({")) {
    failures.push("ReconciliationWorkspace.tsx inline 'Create Session' form must call startReconciliationSession, not a disabled/no-op button");
  }
  if (!workspace.includes("getBankingTiles") || !workspace.includes("const [pickedBankAccountId, setPickedBankAccountId]")) {
    failures.push("ReconciliationWorkspace start form must pick a real bank tile — URL-only bank_account_hint leaves Create Session disabled");
  }

  if (!bankingHome.includes('to="/banking/reconciliation-workspace"') || !/Open Workspace/.test(bankingHome)) {
    failures.push("BankingHome 'Open Workspace' must target /banking/reconciliation-workspace (not /banking/reconciliation Close-period chrome)");
  }
  if (!reconPage.includes('to="/banking/reconciliation-workspace"') || !reconPage.includes('data-testid="banking-recon-start-session"')) {
    failures.push("BankReconciliationPage (sidebar Reconciliation) must expose Start reconciliation → /banking/reconciliation-workspace — a self-link is a dead hop");
  }
  if (reconPage.includes('Link to="/banking/reconciliation"')) {
    failures.push("BankReconciliationPage must not self-link Start a session to /banking/reconciliation");
  }

  if (!manifest.match(/path="\/banking\/reconciliation-workspace"/)) {
    failures.push("manifest.tsx must mount /banking/reconciliation-workspace — the page an operator lands on after starting a session");
  }

  return failures;
}

function write(rootDir, relativePath, contents) {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

if (process.argv.includes("--selftest")) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-banking-recon-start-session-wired-"));
  try {
    const files = {
      [indexPath]: read(root, indexPath),
      [backendRoutesPath]: read(root, backendRoutesPath),
      [apiClientPath]: read(root, apiClientPath),
      [bankingHomePath]: read(root, bankingHomePath),
      [workspacePath]: read(root, workspacePath),
      [reconPagePath]: read(root, reconPagePath),
      [manifestPath]: read(root, manifestPath),
    };
    for (const [rel, contents] of Object.entries(files)) write(temp, rel, contents);

    const correctedFailures = run(temp);
    if (correctedFailures.length > 0) throw new Error(`corrected source failed: ${correctedFailures.join("; ")}`);

    // Mutate: drop the boot registration call — every recon route should then be flagged unmounted.
    write(
      temp,
      indexPath,
      files[indexPath].replace(/await\s+registerBankingReconciliationRoutes\(app\);/, "// removed for selftest")
    );
    let mutationFailures = run(temp);
    if (mutationFailures.length === 0) throw new Error("dropped boot registration was not detected");
    write(temp, indexPath, files[indexPath]);

    // Mutate: disable the BankingHome entry-point button (simulate the exact "dead button" defect class
    // this guard exists to catch) — must be flagged.
    write(
      temp,
      bankingHomePath,
      files[bankingHomePath].replace(
        'ActionButton onClick={openStartReconciliation}>+ Reconcile</ActionButton>',
        'ActionButton disabled>+ Reconcile</ActionButton>'
      )
    );
    mutationFailures = run(temp);
    if (mutationFailures.length === 0) throw new Error("disabled/dead entry-point button was not detected");
    write(temp, bankingHomePath, files[bankingHomePath]);

    write(
      temp,
      reconPagePath,
      files[reconPagePath].replace(
        'to="/banking/reconciliation-workspace"',
        'to="/banking/reconciliation"'
      )
    );
    mutationFailures = run(temp);
    if (mutationFailures.length === 0) throw new Error("sidebar Reconciliation self-link was not detected");
    write(temp, reconPagePath, files[reconPagePath]);

    write(
      temp,
      bankingHomePath,
      files[bankingHomePath].replace(
        'to="/banking/reconciliation-workspace"',
        'to="/banking/reconciliation"'
      )
    );
    mutationFailures = run(temp);
    if (mutationFailures.length === 0) throw new Error("Home Open Workspace mis-route was not detected");
    write(temp, bankingHomePath, files[bankingHomePath]);

    write(
      temp,
      workspacePath,
      files[workspacePath].replace("const [pickedBankAccountId, setPickedBankAccountId]", "const [accountFromUrlOnly, setAccountFromUrlOnly]")
    );
    mutationFailures = run(temp);
    if (mutationFailures.length === 0) throw new Error("workspace missing tile picker was not detected");
    write(temp, workspacePath, files[workspacePath]);

    console.log("verify-banking-recon-start-session-wired --selftest OK");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else {
  const failures = run();
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-recon-start-session-wired OK");
}
