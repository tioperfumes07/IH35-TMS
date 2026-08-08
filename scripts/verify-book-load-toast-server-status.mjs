#!/usr/bin/env node
/**
 * GUARD — LV-DISPATCH-TOAST-LIES. The book-load success toast must be derived from the status the SERVER
 * returned, never from the local save-mode the dispatcher clicked.
 *
 * THE DEFECT, live-proven on prod by CC-3 (2026-08-07, USMCA): after `Override & dispatch` on
 * `L-20260806-0008` the UI showed a green **"Load booked and dispatched"**. On prod that load was — and
 * stayed — `assigned_not_dispatched` (`created_at 02:05:48`, `updated_at 02:05:51`, unchanged on re-query).
 * The toast read `saveMode === "draft" ? "Draft saved" : "Load booked and dispatched"`, so it asserted the
 * POST-dispatch outcome from a local variable while the record sat in the PRE-dispatch state.
 *
 * The server never promised dispatch: `book-load.service.ts` writes
 * `save_mode === "draft" ? "draft" : toMdataStatus(input.status)` — `book_dispatch` does NOT force
 * `dispatched`. And the truth was already on the wire (`RETURNING *` → the 201 row carries `status`); the UI
 * simply never read it.
 *
 * WHY IT IS NOT COSMETIC: the override existed to permit dispatch past two DOT blockers (no CDL expiry on
 * file, no DOT medical card). An override audit trail attesting to an action that did not happen is worse
 * than no override at all — that is what a DOT/FMCSA reviewer or an insurer reads.
 *
 * NOT CLAIMED: this is static analysis of one call site plus its helper. It proves the toast is a function
 * of the server status and that no literal re-asserts dispatch from the save mode. It does not prove the
 * rendered string on a live screen — that is the live-verifier lane's job.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-toast-server-status";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const HELPER = "apps/frontend/src/pages/dispatch/components/book-load-toast.ts";

/** The exact shape that shipped the lie: a toast whose dispatched-claim is chosen by save mode. */
const SAVEMODE_ASSERTS_DISPATCH =
  /pushToast\(\s*saveMode\s*===\s*["']draft["']\s*\?[^)]*?["'][^"']*dispatched[^"']*["']/i;

export function auditModal(src) {
  const problems = [];

  if (SAVEMODE_ASSERTS_DISPATCH.test(src)) {
    problems.push(
      `${MODAL}: the success toast picks its "dispatched" wording from \`saveMode\`. ` +
        `save_mode "book_dispatch" does NOT force the dispatched status server-side, so this tells a ` +
        `dispatcher a truck is rolling under an audited DOT override while the load can still be ` +
        `assigned_not_dispatched (LV-DISPATCH-TOAST-LIES).`,
    );
  }

  // The toast must be produced by the helper, which is the only place allowed to decide the wording.
  if (!/bookLoadToastMessage\s*\(/.test(src)) {
    problems.push(
      `${MODAL}: the success toast is not built by bookLoadToastMessage(). The wording must be a function ` +
        `of the status the server returned, not of the click that was made.`,
    );
  }

  // CLASS INSTANCE 2 (2026-08-08): the maintenance-advisory branch returns EARLY from the submit handler
  // and its Continue button fired its own hardcoded green toast — "Load booked with maintenance advisory" —
  // that had never seen the response. True, but silent about dispatch: a book_dispatch landing on
  // assigned_not_dispatched still rendered green. Same file, same flow, same shape as the defect above, so
  // the guard has to cover it or the class is only half closed.
  if (/pendingCloseAfterAdvisory/.test(src)) {
    const advisoryToast = src.match(/pendingCloseAfterAdvisory\s*\?[\s\S]{0,1400}?pushToast\(([\s\S]{0,400}?)\)\s*;/);
    if (!advisoryToast) {
      problems.push(
        `${MODAL}: the maintenance-advisory Continue branch no longer has a readable pushToast — refusing to ` +
          `pass vacuously on a path that already shipped this defect once.`,
      );
    } else if (!/bookLoadToastMessage/.test(advisoryToast[1])) {
      problems.push(
        `${MODAL}: the maintenance-advisory Continue toast does not use bookLoadToastMessage(). It fires after ` +
          `an early return, so it must report the status carried over from the response — not a hardcoded ` +
          `"success" (LV-DISPATCH-TOAST-LIES, class instance 2).`,
      );
    }
  }

  // ...and the server status has to actually be read off the response.
  if (!/payload[\s\S]{0,200}?\.status\b/.test(src) && !/serverStatus/.test(src)) {
    problems.push(
      `${MODAL}: the create response's \`status\` is never read. The 201 row carries it (RETURNING *); ` +
        `ignoring it is what allowed the toast to assert an outcome the server did not produce.`,
    );
  }

  return problems;
}

export function auditHelper(src) {
  const problems = [];

  // The helper must gate the dispatched wording on the SERVER value.
  if (!/serverStatus\s*===\s*["']dispatched["']/.test(src)) {
    problems.push(
      `${HELPER}: nothing gates the "dispatched" wording on \`serverStatus === "dispatched"\`. ` +
        `That comparison IS the fix; without it the helper can claim dispatch for any status.`,
    );
  }

  // A missing status must not fall back to claiming dispatch — silence is honest, a green lie is not.
  const missingBranch = src.match(/if\s*\(\s*!serverStatus\s*\)\s*return\s*([^;]+);/);
  if (!missingBranch) {
    problems.push(`${HELPER}: no explicit branch for a missing server status — it must not default to a dispatch claim.`);
  } else if (/and dispatched/i.test(missingBranch[1])) {
    problems.push(`${HELPER}: a missing server status still claims dispatch. It must claim nothing it cannot prove.`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodModal = `
    const serverStatus = typeof payload?.status === "string" ? String(payload.status) : null;
    pushToast(bookLoadToastMessage(saveMode, serverStatus), bookLoadToastTone(saveMode, serverStatus));
  `;
  const shippedDefect = `pushToast(saveMode === "draft" ? "Draft saved" : "Load booked and dispatched", "success");`;
  const goodAdvisory = `
    {gateBanner.type === "advisory" && pendingCloseAfterAdvisory ? (
      <Button onClick={() => { pushToast(\`\${bookLoadToastMessage("book_dispatch", advisoryServerStatus)} · maintenance advisory\`, bookLoadToastTone("book_dispatch", advisoryServerStatus)); }} />
    ) : null}
  `;
  const badAdvisory = `
    {gateBanner.type === "advisory" && pendingCloseAfterAdvisory ? (
      <Button onClick={() => { pushToast("Load booked with maintenance advisory", "success"); }} />
    ) : null}
  `;
  const goodHelper = `
    if (saveMode === "draft") return "Draft saved";
    if (!serverStatus) return "Load booked — status unconfirmed";
    if (serverStatus === "dispatched") return "Load booked and dispatched";
    return \`Load booked — \${label}\`;
  `;

  const cases = [
    ["fixed modal", () => auditModal(goodModal), 0],
    ["THE SHIPPED DEFECT — saveMode picks the dispatched wording", () => auditModal(shippedDefect), 3],
    ["modal no longer uses the helper", () => auditModal(goodModal.replace("bookLoadToastMessage", "somethingElse")), 1],
    ["advisory branch reports the server status", () => auditModal(goodModal + goodAdvisory), 0],
    ["CLASS BAR — advisory branch back to a hardcoded green toast", () => auditModal(goodModal + badAdvisory), 1],
    ["fixed helper", () => auditHelper(goodHelper), 0],
    ["helper stops gating on the server status", () => auditHelper(goodHelper.replace('serverStatus === "dispatched"', "true")), 1],
    ["helper claims dispatch when status is missing", () => auditHelper(goodHelper.replace('"Load booked — status unconfirmed"', '"Load booked and dispatched"')), 1],
    ["helper drops the missing-status branch entirely", () => auditHelper(goodHelper.replace(/if \(!serverStatus\) return [^;]+;/, "")), 1],
  ];

  let bad = 0;
  for (const [name, run, want] of cases) {
    const got = run().length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} mutations detected correctly`);
  process.exit(0);
}

for (const rel of [MODAL, HELPER]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`${LABEL} FAIL — missing ${rel}; scope is wrong, refusing to pass vacuously.`);
    process.exit(1);
  }
}

const problems = [
  ...auditModal(fs.readFileSync(path.join(ROOT, MODAL), "utf8")),
  ...auditHelper(fs.readFileSync(path.join(ROOT, HELPER), "utf8")),
];

if (problems.length) {
  console.error(`${LABEL} FAIL — the book-load toast can claim an outcome the server did not produce:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFix: build the toast from the 201 response's \`status\` via bookLoadToastMessage(), never from saveMode.\n`);
  process.exit(1);
}

console.log(`${LABEL} OK — the book-load toast reports the status the server returned.`);
process.exit(0);
