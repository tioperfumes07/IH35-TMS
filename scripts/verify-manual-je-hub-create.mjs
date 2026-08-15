#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity","picker_law"],"leafRe":"^(je\\.(list|create)|je)$","task":"ACCT-F5056-MANUAL-JE-CREATE-URL","pr":"#6460"}
 * ACCT-PR-4/6 — Manual JE create on the Accounting Hub.
 *
 * Guards the audit requirement:
 *   - AccountingHubPage has a "+ Create Manual JE" primary button (never "+ New"/"+ Add").
 *   - It wires the SAME accounting ManualJEModal used by ManualJEListPage (no duplicate Banking modal
 *     import on the hub page).
 *   - Access follows the EXISTING accounting role gate (canAccessAccounting: Owner / Administrator /
 *     Accountant) — the same bar as every other create surface in this module.
 *
 * NO AMOUNT THRESHOLD. This guard previously required an invented $1,000 Owner-only ceiling
 * (MANUAL_JE_OWNER_THRESHOLD_CENTS / canCreateManualJeAtAmount), plus an Owner-only render condition
 * on the hub button. That was a business rule no owner authorised, and it failed closed with a bare
 * 403 `forbidden_manual_je_owner_threshold` that no UI surfaced — an Accountant entering a $1,500 JE
 * got a silent rejection. Owner ruling 2026-07-22: "remove threshold." Both the ceiling and the
 * Owner-only button gate are gone, and this guard now asserts their ABSENCE so neither creeps back
 * in without an owner decision.
 *
 * GUARD-MANUAL-JE-HUB-NO-MUTATION-PROOF (2026-08-15): this was the only leaf-tagged guard with no
 * planted-defect mode — refactored to the checkAll(readFile)/--selftest shape used repo-wide, with
 * ten NAMED INDEPENDENT mutations (one per assertion below) so a regression on any single contract
 * (hub button text/role-gate/modal-import, topbar navigate, list URL-sync, either threshold-absence
 * check) is individually provable, not just "the aggregate went red". The live @matrix-built leafRe
 * and the 2026-07-22 owner ruling (no amount threshold) are unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LABEL = "verify-manual-je-hub-create";

const HUB_PATH = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";
const LIST_PATH = "apps/frontend/src/pages/accounting/ManualJEListPage.tsx";
const TOPBAR_PATH = "apps/frontend/src/components/Topbar.tsx";
const SERVICE_PATH = "apps/backend/src/accounting/journal-entries.service.ts";
const ROUTES_PATH = "apps/backend/src/accounting/journal-entries.routes.ts";

/** Pure: same ten assertions as the original guard, unbundled into named checks so each can be
 * independently mutation-proven. readFile: (relPath) => string | null. */
export function checkAll(readFile) {
  const failures = [];
  const read = (rel) => {
    const src = readFile(rel);
    if (src === null) failures.push(`missing file: ${rel}`);
    return src ?? "";
  };

  const hub = read(HUB_PATH);
  const list = read(LIST_PATH);
  const topbar = read(TOPBAR_PATH);
  const service = read(SERVICE_PATH);
  const routes = read(ROUTES_PATH);

  // 1. Primary button text + locked-button-law compliance (no "+ New" / "+ Add").
  if (!/\+ Create Manual JE/.test(hub)) {
    failures.push(`${HUB_PATH}: missing "+ Create Manual JE" primary button text`);
  }
  if (/["'>]\s*\+\s*New\b/.test(hub) || /["'>]\s*\+\s*Add\b/.test(hub)) {
    failures.push(`${HUB_PATH}: primary button must be "+ Create" / "+ Create Manual JE" — never "+ New"/"+ Add"`);
  }

  // 2. NOT role-narrowed at the button: access is the module's existing canAccessAccounting gate.
  //    An Owner-only render here would hide the action from the Administrators and Accountants who
  //    are exactly the people expected to post manual journal entries.
  if (/user\?\.role === ["']Owner["'][\s\S]{0,200}?Create Manual JE/.test(hub)) {
    failures.push(
      `${HUB_PATH}: "+ Create Manual JE" must NOT be narrowed to Owner — access follows canAccessAccounting (owner ruling 2026-07-22 "remove threshold")`
    );
  }

  // 3. Must import the accounting ManualJEModal (re-exports components/accounting/ManualJEModal),
  //    never the Banking one — do NOT duplicate Banking's ManualJEModal on the accounting hub.
  if (!/import\s*\{\s*ManualJEModal\s*\}\s*from\s*["']\.\/ManualJEModal["']/.test(hub)) {
    failures.push(`${HUB_PATH}: must import ManualJEModal from "./ManualJEModal" (the accounting one)`);
  }
  if (/from\s*["'][^"']*banking\/components\/ManualJEModal["']/.test(hub)) {
    failures.push(`${HUB_PATH}: must NOT import the Banking ManualJEModal`);
  }

  // ACCT-F5056 — Topbar Create→Journal entry must open ManualJEModal via ?create=1.
  if (!topbar.includes("/accounting/journal-entries?create=1")) {
    failures.push(`${TOPBAR_PATH}: Create→Journal entry must navigate to /accounting/journal-entries?create=1`);
  }
  if (!/searchParams\.get\(["']create["']\)\s*===\s*["']1["']/.test(list)) {
    failures.push(`${LIST_PATH}: must honor ?create=1 for ManualJEModal`);
  }
  if (!/params\.delete\(["']create["']\)/.test(list) || !/params\.set\(["']create["'],\s*["']1["']\)/.test(list)) {
    failures.push(`${LIST_PATH}: must URL-sync create open/close`);
  }

  // 4/5. Backend: NO amount threshold anywhere on the manual-JE create path (owner ruling
  //       2026-07-22). Assert absence, so the ceiling cannot be reintroduced without an owner call.
  for (const [label, source] of [[SERVICE_PATH, service], [ROUTES_PATH, routes]]) {
    if (/MANUAL_JE_OWNER_THRESHOLD_CENTS|canCreateManualJeAtAmount|forbidden_manual_je_owner_threshold/.test(source)) {
      failures.push(
        `${label}: manual-JE amount threshold reintroduced — the owner removed it on 2026-07-22. A dollar ceiling on posting is a business decision, not an engineering default.`
      );
    }
  }

  return failures;
}

function realFile(rel) {
  try {
    return readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

if (process.argv.includes("--selftest")) {
  const real = {
    [HUB_PATH]: realFile(HUB_PATH),
    [LIST_PATH]: realFile(LIST_PATH),
    [TOPBAR_PATH]: realFile(TOPBAR_PATH),
    [SERVICE_PATH]: realFile(SERVICE_PATH),
    [ROUTES_PATH]: realFile(ROUTES_PATH),
  };
  for (const [rel, src] of Object.entries(real)) {
    if (src === null) {
      console.error(`[${LABEL}] selftest FAIL: cannot read real file ${rel} to build fixtures from`);
      process.exit(1);
    }
  }

  const goodFailures = checkAll((rel) => real[rel] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: current real files should pass every check — ${goodFailures.join("; ")}`);
    process.exit(1);
  }

  // All-empty content only trips the five "must contain X" checks (button text, modal import,
  // topbar navigate, list ?create=1 read, list URL-sync) — the five "must NOT contain X"
  // absence-checks (no +New/+Add, no Owner-narrowing, no Banking import, no threshold x2)
  // vacuously pass on empty input by construction; those are covered by their own named
  // mutations below, not by this coarse baseline.
  const allEmptyFailures = checkAll(() => "");
  if (allEmptyFailures.length !== 5) {
    console.error(`[${LABEL}] selftest FAIL: all-empty fixture should trip exactly 5 "must contain" checks, got ${allEmptyFailures.length}`);
    process.exit(1);
  }

  // Ten NAMED, INDEPENDENT mutations — each regresses exactly ONE assertion against the real
  // (otherwise-passing) files, so a defect on any single contract is individually provable.
  const mutations = [
    {
      name: "hub button text removed",
      file: HUB_PATH,
      mutate: (s) => s.replace(/\+ Create Manual JE/g, "+ Create JE"),
    },
    {
      name: "hub button reverted to + New",
      file: HUB_PATH,
      mutate: (s) => s.replace(/\+ Create Manual JE/, "+ New Manual JE"),
    },
    {
      name: "hub button narrowed to Owner-only",
      file: HUB_PATH,
      mutate: (s) => s.replace(/\+ Create Manual JE/, 'user?.role === "Owner" + Create Manual JE'),
    },
    {
      name: "hub imports the wrong (non-relative) ManualJEModal",
      file: HUB_PATH,
      mutate: (s) => s.replace(/import\s*\{\s*ManualJEModal\s*\}\s*from\s*["']\.\/ManualJEModal["']/, 'import { ManualJEModal } from "../banking/components/ManualJEModal"'),
    },
    {
      name: "hub imports the Banking ManualJEModal alongside the real one",
      file: HUB_PATH,
      mutate: (s) => s + '\nimport { ManualJEModal as BankingManualJEModal } from "../banking/components/ManualJEModal";\n',
    },
    {
      name: "topbar no longer navigates to journal-entries?create=1",
      file: TOPBAR_PATH,
      mutate: (s) => s.replaceAll("/accounting/journal-entries?create=1", "/accounting/journal-entries"),
    },
    {
      name: "list no longer honors ?create=1",
      file: LIST_PATH,
      mutate: (s) => s.replace(/searchParams\.get\(["']create["']\)\s*===\s*["']1["']/, 'searchParams.get("open") === "1"'),
    },
    {
      name: "list drops URL-sync on close (params.delete removed)",
      file: LIST_PATH,
      mutate: (s) => s.replace(/params\.delete\(["']create["']\)/, "params.set(\"open\", \"0\")"),
    },
    {
      name: "service reintroduces the owner-removed amount threshold",
      file: SERVICE_PATH,
      mutate: (s) => s + "\nconst MANUAL_JE_OWNER_THRESHOLD_CENTS = 100000;\n",
    },
    {
      name: "routes reintroduces the owner-removed 403",
      file: ROUTES_PATH,
      mutate: (s) => s + '\nif (true) throw new Error("forbidden_manual_je_owner_threshold");\n',
    },
  ];

  for (const m of mutations) {
    const mutated = { ...real, [m.file]: m.mutate(real[m.file]) };
    const problems = checkAll((rel) => mutated[rel] ?? null);
    if (!problems.length) {
      console.error(`[${LABEL}] selftest FAIL: mutation "${m.name}" was not rejected`);
      process.exit(1);
    }
  }

  console.log(`[${LABEL}] selftest PASS — real files clean; all-empty trips ${allEmptyFailures.length} checks; ${mutations.length}/${mutations.length} independent mutations rejected`);
  process.exit(0);
}

const failures = checkAll(realFile);
if (failures.length) {
  console.error(`FAIL ${LABEL}:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`PASS ${LABEL} — hub create wired via canAccessAccounting; no amount threshold`);
