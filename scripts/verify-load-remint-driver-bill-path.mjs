#!/usr/bin/env node
/**
 * ACCT-F10164 — live-verified 39 of 78 USMCA loads reached delivery-evidence status with zero
 * driver_bills (19 with a resolvable rate that never minted, the ACCT-F10159 stale-object class at
 * historical scale). ensureDriverBillArtifactsForLoad (ACCT-F277) is already the canonical,
 * idempotent, re-entrant mint, but the only caller was the status-PATCH route, gated on a status
 * TRANSITION — a load already SITTING at completed_docs_received/delivered_pending_docs had no live
 * re-entry point at all. This guard locks the fix: a dedicated route + button that call the SAME
 * function directly, gated by the same delivery-evidence predicate, never hand-writing driver_bills.
 *
 *   node scripts/verify-load-remint-driver-bill-path.mjs
 *   node scripts/verify-load-remint-driver-bill-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-remint-driver-bill-path";

const ROUTES = "apps/backend/src/mdata/loads.routes.ts";
const FE_API = "apps/frontend/src/api/loads.ts";
const FE_DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard({ routes, feApi, feDrawer }) {
  const errs = [];

  if (!routes?.includes('app.post(\n    "/api/v1/mdata/loads/:id/remint-driver-bill"') && !routes?.includes('"/api/v1/mdata/loads/:id/remint-driver-bill"')) {
    errs.push(`${ROUTES}: the remint-driver-bill route must exist`);
  }
  if (!routes?.includes("ensureDriverBillArtifactsForLoad(") ) {
    errs.push(`${ROUTES}: must reuse ensureDriverBillArtifactsForLoad — never invent a second mint path`);
  }
  const routeBlockMatch = routes?.match(/"\/api\/v1\/mdata\/loads\/:id\/remint-driver-bill"[\s\S]*?\n  \}\s*\);/);
  const routeBlock = routeBlockMatch ? routeBlockMatch[0] : routes ?? "";
  if (!/loadStatusRequiresDeliveryDepartureStamp\(current\.status\)/.test(routeBlock)) {
    errs.push(`${ROUTES}: the remint route must gate on loadStatusRequiresDeliveryDepartureStamp, the same predicate the status-PATCH route uses to decide whether to mint`);
  }
  if (!/appendCrudAudit\(/.test(routeBlock) || !/driver_bill_remint_attempted/.test(routeBlock)) {
    errs.push(`${ROUTES}: every remint attempt must be audited`);
  }
  if (!/REMINT_ROLES\.has\(authUser\.role\)/.test(routeBlock)) {
    errs.push(`${ROUTES}: the remint route must check REMINT_ROLES, not the broader dispatch-write gate — this mints a real payable`);
  }
  if (!/const REMINT_ROLES = new Set\(/.test(routes ?? "") || !/"Accountant"/.test(routes ?? "")) {
    errs.push(`${ROUTES}: LAW — Accountant must always be in the remint role set (isOfficeWriteRole alone excludes it)`);
  }
  if (!/reason:\s*z\.string\(\)[^;]*\.min\(1\)/.test(routes ?? "")) {
    errs.push(`${ROUTES}: remint body must require a non-empty reason — LAW: every edit is traceable to why`);
  }
  if (!/reason:\s*body\.data\.reason/.test(routeBlock)) {
    errs.push(`${ROUTES}: the audit event must carry the caller's stated reason`);
  }

  if (!feApi?.includes("remintDriverBill") || !feApi?.includes("/remint-driver-bill")) {
    errs.push(`${FE_API}: must expose a remintDriverBill API function calling the new route`);
  }
  if (!feApi?.includes("useRemintDriverBill")) {
    errs.push(`${FE_API}: must expose a useRemintDriverBill mutation hook`);
  }

  if (!feDrawer?.includes("useRemintDriverBill")) {
    errs.push(`${FE_DRAWER}: LoadDetailDrawer must wire the remint mutation`);
  }
  if (!feDrawer?.includes("canRemintDriverBill")) {
    errs.push(`${FE_DRAWER}: must gate the button on the same delivery-evidence predicate as the backend`);
  }
  if (!feDrawer?.includes('"delivered_pending_docs", "completed_docs_received"')) {
    errs.push(`${FE_DRAWER}: canRemintDriverBill must match the backend's exact status set, not a wider/narrower one`);
  }
  if (!feDrawer?.includes("Remint driver bill")) {
    errs.push(`${FE_DRAWER}: the button must actually be reachable — no live UI, no live click, no fix`);
  }

  return errs;
}

function selftest() {
  const goodRoutes = `
    const REMINT_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
    const remintBodySchema = z.object({ reason: z.string().trim().min(1).max(2000) });
    app.post(
      "/api/v1/mdata/loads/:id/remint-driver-bill",
      { config: {} },
      async (req, reply) => {
        const authUser = currentAuthUser(req, reply);
        if (!REMINT_ROLES.has(authUser.role)) return reply.code(403).send({ error: "forbidden" });
        const body = remintBodySchema.safeParse(req.body ?? {});
        if (!loadStatusRequiresDeliveryDepartureStamp(current.status)) {
          return { error: "load_not_past_delivery_evidence" };
        }
        const outcome = await ensureDriverBillArtifactsForLoad(client, {});
        await appendCrudAudit(client, authUser.uuid, "mdata.loads.driver_bill_remint_attempted", { reason: body.data.reason }, "info", "X");
        return { ok: true, outcome };
      }
    );
  `;
  const goodFeApi = `
    export function remintDriverBill(id, operatingCompanyId, reason) {
      return apiRequest(\`/api/v1/mdata/loads/\${id}/remint-driver-bill\`, { method: "POST", body: { reason } });
    }
    export function useRemintDriverBill(operatingCompanyId) {}
  `;
  const goodFeDrawer = `
    const remintDriverBillMutation = useRemintDriverBill(x);
    const canRemintDriverBill = useMemo(() => ["delivered_pending_docs", "completed_docs_received"].includes(load.status), [load]);
    <Button>Remint driver bill</Button>
  `;

  const good = assertGuard({ routes: goodRoutes, feApi: goodFeApi, feDrawer: goodFeDrawer });
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good (${good.length}): ${good.join("; ")}`);
    process.exit(1);
  }

  const bad1 = assertGuard({ routes: goodRoutes.replace("ensureDriverBillArtifactsForLoad(client, {})", "await client.query(`INSERT INTO driver_finance.driver_bills ...`)"), feApi: goodFeApi, feDrawer: goodFeDrawer });
  const bad2 = assertGuard({ routes: goodRoutes.replace("if (!loadStatusRequiresDeliveryDepartureStamp(current.status)) {\n          return { error: \"load_not_past_delivery_evidence\" };\n        }", ""), feApi: goodFeApi, feDrawer: goodFeDrawer });
  const bad3 = assertGuard({ routes: goodRoutes.replace(/await appendCrudAudit[\s\S]*?"X"\);/, ""), feApi: goodFeApi, feDrawer: goodFeDrawer });
  const bad4 = assertGuard({ routes: goodRoutes, feApi: goodFeApi, feDrawer: goodFeDrawer.replace("<Button>Remint driver bill</Button>", "") });
  const bad5 = assertGuard({ routes: goodRoutes, feApi: goodFeApi, feDrawer: goodFeDrawer.replace('["delivered_pending_docs", "completed_docs_received"]', '["completed_docs_received"]') });
  const bad6 = assertGuard({ routes: goodRoutes.replace('"Accountant"', '"Manager"'), feApi: goodFeApi, feDrawer: goodFeDrawer });
  const bad7 = assertGuard({ routes: goodRoutes.replace(".min(1).max(2000)", ".optional()"), feApi: goodFeApi, feDrawer: goodFeDrawer });
  const bad8 = assertGuard({ routes: goodRoutes.replace("{ reason: body.data.reason }", "{}"), feApi: goodFeApi, feDrawer: goodFeDrawer });

  for (const [name, res] of [
    ["bad1-hand-writes-bill", bad1],
    ["bad2-no-status-gate", bad2],
    ["bad3-no-audit", bad3],
    ["bad4-no-button", bad4],
    ["bad5-status-set-mismatch", bad5],
    ["bad6-accountant-excluded", bad6],
    ["bad7-reason-optional", bad7],
    ["bad8-reason-not-audited", bad8],
  ]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 8/8 mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const routes = read(ROUTES);
const feApi = read(FE_API);
const feDrawer = read(FE_DRAWER);
if ([routes, feApi, feDrawer].some((f) => f == null)) {
  console.error(`[${LABEL}] FAILED — missing source file`);
  process.exit(1);
}
const errs = assertGuard({ routes, feApi, feDrawer });
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — a load stuck past delivery evidence with no driver bill has a real, audited, role-gated live-UI remint path`);
