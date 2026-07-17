#!/usr/bin/env node
/**
 * verify-dispatch-cancel-approval-gate.mjs  (0441-mod4)
 *
 * Root cause: PATCH /api/v1/mdata/loads/:id/status could flip a load to cancelled
 * without consulting catalogs.cancellation_reasons.requires_owner_approval, and
 * LoadDetailDrawer called cancelDispatchLoad (gated) then cancelMutation (ungated PATCH),
 * overwriting pending_owner_approval with cancelled.
 *
 * Locks: server-side requires_owner_approval gate on the mdata status PATCH handler,
 * and the UI must not double-call the unguarded PATCH after cancelDispatchLoad.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-cancel-approval-gate";

const LOADS_ROUTES = "apps/backend/src/mdata/loads.routes.ts";
const LOAD_DETAIL_DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest planted fixtures. */
export function checkMdataStatusPatchGate(src) {
  const failures = [];
  if (!/\/api\/v1\/mdata\/loads\/:id\/status/.test(src)) {
    failures.push(`${LOADS_ROUTES}: PATCH /api/v1/mdata/loads/:id/status handler missing`);
  }
  if (!/catalogs\.cancellation_reasons/.test(src)) {
    failures.push(`${LOADS_ROUTES}: cancel status PATCH must read catalogs.cancellation_reasons`);
  }
  if (!/requires_owner_approval/.test(src)) {
    failures.push(`${LOADS_ROUTES}: cancel status PATCH must consult requires_owner_approval`);
  }
  if (!/owner_approval_required/.test(src)) {
    failures.push(`${LOADS_ROUTES}: must return owner_approval_required when gate blocks non-Owner`);
  }
  if (!/isOwnerRole\(authUser\.role\)/.test(src) && !/role === "Owner"/.test(src)) {
    failures.push(`${LOADS_ROUTES}: must gate on Owner role for approval-required reasons`);
  }
  return failures;
}

export function checkLoadDetailDrawerNoBypass(src) {
  const failures = [];
  if (!/cancelDispatchLoad/.test(src)) {
    failures.push(`${LOAD_DETAIL_DRAWER}: CancelLoadModal onSubmit must call cancelDispatchLoad`);
  }
  if (/cancelMutation\.mutateAsync/.test(src)) {
    failures.push(
      `${LOAD_DETAIL_DRAWER}: must not call cancelMutation after cancelDispatchLoad (ungated PATCH bypass)`,
    );
  }
  if (/useCancelLoad/.test(src)) {
    failures.push(`${LOAD_DETAIL_DRAWER}: must not use useCancelLoad — cancel goes through dispatch API`);
  }
  if (!/pending_owner_approval/.test(src)) {
    failures.push(`${LOAD_DETAIL_DRAWER}: toast must distinguish pending_owner_approval from immediate cancel`);
  }
  return failures;
}

export function run() {
  const failures = [];
  for (const rel of [LOADS_ROUTES, LOAD_DETAIL_DRAWER]) {
    const { ok, src, err } = read(rel);
    if (!ok) {
      failures.push(err);
      continue;
    }
    if (rel === LOADS_ROUTES) failures.push(...checkMdataStatusPatchGate(src));
    if (rel === LOAD_DETAIL_DRAWER) failures.push(...checkLoadDetailDrawerNoBypass(src));
  }
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodRoutes = `
    app.patch("/api/v1/mdata/loads/:id/status", async () => {});
    FROM catalogs.cancellation_reasons
    requires_owner_approval
    if (reason.requires_owner_approval && !isOwnerRole(authUser.role)) {
      return { error: "owner_approval_required" };
    }
    reply.code(403).send({ error: "owner_approval_required" });
  `;
  const badRoutesNoCatalog = `app.patch("/api/v1/mdata/loads/:id/status", async () => { UPDATE mdata.loads SET status = 'cancelled'; });`;
  const goodDrawer = `
    const result = await cancelDispatchLoad(load.id, { ...payload });
    const cancelStatus = String((result as { status?: string }).status ?? "");
    pushToast(cancelStatus === "pending_owner_approval" ? "submitted" : "cancelled", "success");
  `;
  const badDrawerDoubleCall = `
    await cancelDispatchLoad(load.id, payload);
    await cancelMutation.mutateAsync({ id: load.id });
  `;

  const checks = [
    ["good routes pass", checkMdataStatusPatchGate(goodRoutes).length === 0],
    ["routes without catalog fail", checkMdataStatusPatchGate(badRoutesNoCatalog).length > 0],
    ["good drawer passes", checkLoadDetailDrawerNoBypass(goodDrawer).length === 0],
    ["drawer double-call fails", checkLoadDetailDrawerNoBypass(badDrawerDoubleCall).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — mdata cancel PATCH owner-approval gate + UI bypass removed`);
process.exit(0);
