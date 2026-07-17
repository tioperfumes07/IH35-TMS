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

function extractBalancedBlock(src, openBraceIndex) {
  if (openBraceIndex < 0 || src[openBraceIndex] !== "{") return "";
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openBraceIndex; i < src.length; i += 1) {
    const char = src[i];
    const next = src[i + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(openBraceIndex + 1, i);
    }
  }
  return "";
}

function extractStatusPatchHandler(src) {
  const route = /app\.patch\(\s*["']\/api\/v1\/mdata\/loads\/:id\/status["'][\s\S]*?async\s*\([^)]*\)\s*=>\s*\{/m.exec(src);
  if (!route) return "";
  return extractBalancedBlock(src, route.index + route[0].lastIndexOf("{"));
}

function extractCancelledBlocks(handler) {
  const blocks = [];
  const branchPattern = /if\s*\(\s*newStatus\s*===\s*["']cancelled["'][^)]*\)\s*\{/gm;
  for (const branch of handler.matchAll(branchPattern)) {
    blocks.push(extractBalancedBlock(handler, branch.index + branch[0].lastIndexOf("{")));
  }
  return blocks.filter(Boolean);
}

/** Exported for --selftest planted fixtures. */
export function checkMdataStatusPatchGate(src) {
  const failures = [];
  const handler = extractStatusPatchHandler(src);
  if (!handler) {
    failures.push(`${LOADS_ROUTES}: PATCH /api/v1/mdata/loads/:id/status handler missing`);
    return failures;
  }
  const cancelledBlocks = extractCancelledBlocks(handler);
  if (cancelledBlocks.length === 0) {
    failures.push(`${LOADS_ROUTES}: status PATCH must enforce cancellation inside its cancelled-status branch`);
    return failures;
  }
  const cancelGate = cancelledBlocks.find((block) => /catalogs\.cancellation_reasons/.test(block)) ?? "";
  if (!/catalogs\.cancellation_reasons/.test(cancelGate)) {
    failures.push(`${LOADS_ROUTES}: cancelled-status branch must read catalogs.cancellation_reasons`);
  }
  if (!/reason\.requires_owner_approval\s*&&\s*!isOwnerRole\(authUser\.role\)/.test(cancelGate)) {
    failures.push(`${LOADS_ROUTES}: cancelled-status branch must gate requires_owner_approval on Owner role`);
  }
  if (!/return\s*\{\s*error:\s*["']owner_approval_required["']/.test(cancelGate)) {
    failures.push(`${LOADS_ROUTES}: cancelled-status branch must return owner_approval_required`);
  }
  if (!/result\.error\s*===\s*["']owner_approval_required["'][\s\S]{0,300}?reply\.code\(403\)\.send\(\s*\{\s*error:\s*["']owner_approval_required["']\s*\}\s*\)/.test(handler)) {
    failures.push(`${LOADS_ROUTES}: same status PATCH handler must map owner_approval_required to HTTP 403`);
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
    app.patch("/api/v1/mdata/loads/:id/status", async (req, reply) => {
      const result = await withCurrentUser(authUser.uuid, async (client) => {
        if (newStatus === "cancelled" && cancellationReasonCode) {
          await client.query("SELECT requires_owner_approval FROM catalogs.cancellation_reasons");
          if (reason.requires_owner_approval && !isOwnerRole(authUser.role)) {
            return { error: "owner_approval_required" };
          }
        }
        return { ok: true };
      });
      if (result.error === "owner_approval_required") {
        return reply.code(403).send({ error: "owner_approval_required" });
      }
    });
  `;
  const badRoutesNoCatalog = `app.patch("/api/v1/mdata/loads/:id/status", async () => { UPDATE mdata.loads SET status = 'cancelled'; });`;
  const badRoutesDisconnected = `
    app.patch("/api/v1/mdata/loads/:id/status", async () => {});
    if (newStatus === "cancelled") {
      FROM catalogs.cancellation_reasons;
      if (reason.requires_owner_approval && !isOwnerRole(authUser.role)) {
        return { error: "owner_approval_required" };
      }
    }
    reply.code(403).send({ error: "owner_approval_required" });
  `;
  const badRoutesGateOutsideCancelledBranch = `
    app.patch("/api/v1/mdata/loads/:id/status", async (req, reply) => {
      if (newStatus === "cancelled") UPDATE mdata.loads;
      await client.query("SELECT requires_owner_approval FROM catalogs.cancellation_reasons");
      if (reason.requires_owner_approval && !isOwnerRole(authUser.role)) {
        return { error: "owner_approval_required" };
      }
      if (result.error === "owner_approval_required") {
        return reply.code(403).send({ error: "owner_approval_required" });
      }
    });
  `;
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
    ["empty handler with disconnected tokens fails", checkMdataStatusPatchGate(badRoutesDisconnected).length > 0],
    ["gate outside cancelled branch fails", checkMdataStatusPatchGate(badRoutesGateOutsideCancelledBranch).length > 0],
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
