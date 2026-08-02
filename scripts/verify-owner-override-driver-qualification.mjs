#!/usr/bin/env node
/**
 * GUARD — OWNER-ALWAYS-OVERRIDE (owner ruling 2026-08-02).
 *
 * THE DEFECT THIS ASSERTS AGAINST (live, USMCA Book Load): pre-dispatch blockers
 * (WF-CDL-MISSING, WF-MED-CARD-MISSING) offered an override-reason textarea and a line reading
 * "Dispatcher-level override requires owner approval — contact your owner to proceed" — shown to the
 * OWNER as well. Two independent faults made it a dead end:
 *   1. FRONTEND: BookLoadModalV4 rendered <PreDispatchValidationPanel/> WITHOUT passing overrideReason
 *      or onOverrideReasonChange. Both props are optional, so `value={overrideReason ?? ""}` was
 *      permanently "" and onChange optional-chained to a no-op — the box could not take a keystroke.
 *   2. BACKEND: the driver-qualification gate in book-load.service.ts was an ABSOLUTE 422 with no
 *      override branch at all, unlike the sibling unit-block / OOS gates which have had an Owner
 *      override since BT-3. Even a completed reason had nothing to unlock.
 *
 * THE RULING: the Owner can override ANY pre-dispatch blocker, because the blocker may be WRONG — a
 * credential valid in reality but stale, missing or unreadable in the system (integration down,
 * document not ingested, data-entry gap). Only the Owner may authorize it, and it is an ATTESTATION
 * ON THE RECORD, never a silent bypass.
 *
 * WHAT IT ENFORCES — the override must stay OWNER-ONLY, REASONED and AUDITED:
 *   A. the gate has an Owner-role-checked override branch;
 *   B. that branch requires a reason of >= 10 characters;
 *   C. that branch writes an appendCrudAudit event naming the override;
 *   D. the non-override path still returns E_DRIVER_NOT_QUALIFIED (the gate is not removed);
 *   E. the frontend actually wires the reason props (or the box is dead again).
 * Weakening any one of these — e.g. dropping the role check so a Dispatcher can self-authorize, or
 * dropping the audit call so the override leaves no trace — fails this guard.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:owner-override-driver-qualification";
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const LOG_ROUTE = "apps/backend/src/dispatch/dispatch-refinements.routes.ts";
const INDEX = "apps/backend/src/index.ts";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const PANEL = "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx";

const OVERRIDE_EVENT = "dispatch.driver_qualification_overridden_by_owner";

function analyse(files) {
  const problems = [];
  const svc = files[SERVICE];
  const modal = files[MODAL];
  const panel = files[PANEL];

  for (const [name, src] of [[SERVICE, svc], [MODAL, modal], [PANEL, panel]]) {
    if (src == null) problems.push(`${name} is missing — cannot verify the owner-override contract.`);
  }
  if (svc == null || modal == null || panel == null) return problems;

  // A — the override branch exists AND is role-gated to Owner.
  const hasOverrideBranch = svc.includes(OVERRIDE_EVENT);
  if (!hasOverrideBranch) {
    problems.push(
      `${SERVICE}: no "${OVERRIDE_EVENT}" audit event. The Owner override for the driver-qualification ` +
        `gate is gone — the gate is an absolute 422 again and the UI reason box is a dead end.`
    );
  } else {
    // The role check and the >=10 reason must live in the SAME branch that decides to override.
    const branch = svc.slice(
      Math.max(0, svc.indexOf("ownerOverridingQualification")),
      svc.indexOf(OVERRIDE_EVENT) + 200
    );
    if (!/canOwnerOverrideQualification\s*\(\s*input\.requestingUserRole\s*\)/.test(branch)) {
      problems.push(
        `${SERVICE}: the driver-qualification override is not gated on ` +
          `canOwnerOverrideQualification(input.requestingUserRole). A non-Owner could self-authorize ` +
          `a dispatch past a CDL / DOT-medical blocker.`
      );
    }
    if (!/override_reason[\s\S]{0,120}trim\(\)\.length\s*>=\s*10/.test(branch)) {
      problems.push(
        `${SERVICE}: the driver-qualification override no longer requires a >= 10 character reason. ` +
          `An unreasoned override is an unauditable one.`
      );
    }
  }

  // A1b — PIN THE HELPER ITSELF TO OWNER. Asserting only that the branch CALLS a helper is not
  // enough: the helper's body is where a regression would actually land. canOwnerOverrideQualification
  // exists separately from canOverrideUnitBlock precisely so a change aimed at unit-block/OOS
  // overrides cannot silently widen the DOT driver-qualification stop. This is the single place a
  // regression could put a non-Owner past a federal hard-stop, so it is asserted literally.
  if (hasOverrideBranch && !/function canOwnerOverrideQualification\s*\([^)]*\)\s*\{\s*return\s+role\s*===\s*"Owner";\s*\}/.test(svc)) {
    problems.push(
      `${SERVICE}: canOwnerOverrideQualification is not pinned to \`role === "Owner"\`. Widening it — ` +
        `or pointing the qualification gate at the shared canOverrideUnitBlock, which also serves ` +
        `unit-block/OOS and could be widened for those — would put a non-Owner past a CDL / ` +
        `DOT-medical hard-stop with this guard still green.`
    );
  }

  // A2b — the attestation must name the DISPATCH, not just the driver.
  if (hasOverrideBranch && !/load_context:\s*loadContext/.test(svc)) {
    problems.push(
      `${SERVICE}: the override audit row lost load_context. "Owner attested for driver X" does not ` +
        `tie the attestation to the specific dispatch it authorized — a DOT reviewer, insurer or ` +
        `court needs the load/lane/date it applied to.`
    );
  }

  // A2 — the class tag and the per-dispatch scope must be on the audit row. These are what make the
  // record queryable by an insurer/DOT/attorney and what proves the override was NOT a standing bypass.
  if (hasOverrideBranch) {
    if (!/override_class:\s*"DOT_QUALIFICATION"/.test(svc)) {
      problems.push(
        `${SERVICE}: the override audit row lost override_class: "DOT_QUALIFICATION". That literal is ` +
          `the query key for the Owner-Override Log — without it these events cannot be pulled as a ` +
          `class and the report goes blind.`
      );
    }
    if (!/attestation_scope:\s*"single_dispatch"/.test(svc)) {
      problems.push(
        `${SERVICE}: the override audit row lost attestation_scope: "single_dispatch". The record must ` +
          `state on its face that the Owner attested for THIS load only, never "CDL gate off".`
      );
    }
  }

  // A3 — PER-DISPATCH: nothing may persist the override so it suppresses the NEXT load's gate. The
  // decision may live only in the request. A column/flag/cache that remembers it is a standing bypass.
  if (/(qualification_override|driver_qualification_override)_(until|expires|active|enabled)/i.test(svc)) {
    problems.push(
      `${SERVICE}: something persists a driver-qualification override beyond this request. The ` +
        `override must be PER-DISPATCH — each load requires a fresh owner attestation.`
    );
  }

  // F — the Owner-Override Log must exist AND be mounted (a route file alone is not proof).
  const logRoute = files[LOG_ROUTE];
  const index = files[INDEX];
  if (logRoute == null || !/owner-override-log/.test(logRoute)) {
    problems.push(
      `${LOG_ROUTE}: the /api/v1/dispatch/owner-override-log report is missing. An override that ` +
        `cannot be reviewed as a list is not reviewable in practice.`
    );
  }
  if (index != null && logRoute != null && /owner-override-log/.test(logRoute)) {
    if (!/registerDispatchRefinementsRoutes\s*\(/.test(index)) {
      problems.push(
        `${INDEX}: registerDispatchRefinementsRoutes is not registered, so the Owner-Override Log ` +
          `route is not mounted — it would 404. A file existing is not proof.`
      );
    }
  }

  // D — the gate itself must still exist for the non-override path.
  if (!/E_DRIVER_NOT_QUALIFIED/.test(svc)) {
    problems.push(
      `${SERVICE}: E_DRIVER_NOT_QUALIFIED is gone. The override must sit BESIDE the gate, never ` +
        `replace it — every non-Owner path must still be blocked.`
    );
  }

  // E — the frontend must wire the reason props, or the textarea is inert again.
  if (!/overrideReason=\{overrideReason\}/.test(modal) || !/onOverrideReasonChange=\{setOverrideReason\}/.test(modal)) {
    problems.push(
      `${MODAL}: PreDispatchValidationPanel is not passed overrideReason / onOverrideReasonChange. ` +
        `Both props are OPTIONAL, so omitting them silently makes the override textarea a controlled ` +
        `input with a no-op onChange — it cannot accept a keystroke. That was the original defect.`
    );
  }
  if (!/canOwnerOverride/.test(panel) || !/onOwnerOverride/.test(panel)) {
    problems.push(
      `${PANEL}: the owner-override affordance is gone. The Owner would again be shown ` +
        `"contact your owner to proceed" with no way to act.`
    );
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [SERVICE, MODAL, PANEL, LOG_ROUTE, INDEX]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => {
    if (!cond) failures.push(label);
  };

  const goodSvc =
    `function canOwnerOverrideQualification(role) { return role === "Owner"; }\n` +
    `load_context: loadContext,\n` +
    `const ownerOverridingQualification = canOwnerOverrideQualification(input.requestingUserRole) && ` +
    `typeof input.override_reason === "string" && input.override_reason.trim().length >= 10;\n` +
    `await appendCrudAudit(client, u, "${OVERRIDE_EVENT}", { override_class: "DOT_QUALIFICATION", attestation_scope: "single_dispatch" });\n` +
    `error: "E_DRIVER_NOT_QUALIFIED",`;
  const goodModal = `overrideReason={overrideReason}\nonOverrideReasonChange={setOverrideReason}`;
  const goodPanel = `canOwnerOverride = false, onOwnerOverride,`;

  const goodLog = `app.get("/api/v1/dispatch/owner-override-log", ...)`;
  const goodIndex = `await registerDispatchRefinementsRoutes(app);`;
  const base = { [LOG_ROUTE]: goodLog, [INDEX]: goodIndex };

  t("wired + owner-gated + reasoned + audited + logged passes", analyse({ ...base, [SERVICE]: goodSvc, [MODAL]: goodModal, [PANEL]: goodPanel }).length === 0);
  t(
    "helper widened past Owner FAILS",
    analyse({ ...base, [SERVICE]: goodSvc.replace('return role === "Owner";', 'return ["Owner","Manager"].includes(role);'), [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  t(
    "missing load_context FAILS",
    analyse({ ...base, [SERVICE]: goodSvc.replace("load_context: loadContext,\n", ""), [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  t(
    "missing override_class FAILS",
    analyse({ ...base, [SERVICE]: goodSvc.replace(' override_class: "DOT_QUALIFICATION",', ""), [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  t(
    "missing attestation_scope (standing bypass risk) FAILS",
    analyse({ ...base, [SERVICE]: goodSvc.replace(' attestation_scope: "single_dispatch"', ""), [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  t(
    "persisted override flag (standing bypass) FAILS",
    analyse({ ...base, [SERVICE]: goodSvc + "\nqualification_override_until = $1", [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  t(
    "log route missing FAILS",
    analyse({ ...base, [LOG_ROUTE]: "no report here", [SERVICE]: goodSvc, [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  t(
    "log route present but NOT mounted FAILS",
    analyse({ [LOG_ROUTE]: goodLog, [INDEX]: "nothing registered", [SERVICE]: goodSvc, [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );

  // The REAL pre-fix backend: absolute 422, no override branch.
  t(
    "no override branch FAILS (the original dead end)",
    analyse({ ...base, [SERVICE]: `error: "E_DRIVER_NOT_QUALIFIED",`, [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  // Role check dropped — a Dispatcher could self-authorize.
  t(
    "override without the Owner role check FAILS",
    analyse({
      ...base,
      [SERVICE]: goodSvc.replace("canOwnerOverrideQualification(input.requestingUserRole) && ", ""),
      [MODAL]: goodModal,
      [PANEL]: goodPanel,
    }).length === 1
  );
  // Reason requirement dropped.
  t(
    "override without the >=10 char reason FAILS",
    analyse({
      ...base,
      [SERVICE]: goodSvc.replace('input.override_reason.trim().length >= 10', "true"),
      [MODAL]: goodModal,
      [PANEL]: goodPanel,
    }).length === 1
  );
  // The gate itself removed — override must not replace the block.
  t(
    "gate removed entirely FAILS",
    analyse({ ...base, [SERVICE]: goodSvc.replace(`error: "E_DRIVER_NOT_QUALIFIED",`, ""), [MODAL]: goodModal, [PANEL]: goodPanel }).length === 1
  );
  // The REAL pre-fix frontend: props never passed.
  t(
    "unwired modal FAILS (textarea inert)",
    analyse({ ...base, [SERVICE]: goodSvc, [MODAL]: `onValidationChange={cb}`, [PANEL]: goodPanel }).length === 1
  );
  t(
    "panel affordance removed FAILS",
    analyse({ ...base, [SERVICE]: goodSvc, [MODAL]: goodModal, [PANEL]: `const x = 1;` }).length === 1
  );

  // Exit INSIDE selftest — verify-selftests-can-fail.mjs treats "collects failures but cannot exit
  // non-zero" as fake-green, correctly: an unreachable failure path proves nothing.
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 14 cases (1 pass-shape, 13 fail-shapes incl. both real defects, helper-widening, missing load context, standing-bypass, unmounted-report)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — owner-only, reasoned, audited override; gate intact; reason box wired`);
