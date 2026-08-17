#!/usr/bin/env node
/**
 * LV-DISPATCH-LOAD-DEEPLINK-DRAWER / LV-WO-LOAD-DRAWER-PORTAL / LV-DOCS-LOAD-DISPLAY-ID-DEEPLINK
 * /dispatch/loads/:id must open LoadDetailDrawer (Devin Live FAIL: board-only after WO load click).
 * Harden: pathname fallback + pinned id + createPortal to document.body.
 * GET detail must accept human load_number (e.g. L-20260811-0032) — UUID-only zod 400'd / empty drawer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const DISPATCH = path.join(ROOT, "apps/frontend/src/pages/Dispatch.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const LOAD_REF = path.join(ROOT, "apps/backend/src/lib/load-ref.ts");
const MDATA_LOADS = path.join(ROOT, "apps/backend/src/mdata/loads.routes.ts");
const DISPATCH_LOADS = path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts");

function fail(msg) {
  console.error(`FAIL verify-dispatch-load-deeplink-opens-drawer: ${msg}`);
  process.exit(1);
}

function main() {
  const manifest = fs.readFileSync(MANIFEST, "utf8");
  const dispatch = fs.readFileSync(DISPATCH, "utf8");
  const drawer = fs.readFileSync(DRAWER, "utf8");
  const loadRef = fs.readFileSync(LOAD_REF, "utf8");
  const mdataLoads = fs.readFileSync(MDATA_LOADS, "utf8");
  const dispatchLoads = fs.readFileSync(DISPATCH_LOADS, "utf8");

  if (!/DispatchPage[\s\S]{0,120}deepLinkLoadId=\{id\}/.test(manifest) && !/deepLinkLoadId=\{id\}/.test(manifest)) {
    fail("DispatchLoadDetailRoute must pass deepLinkLoadId={id} to DispatchPage");
  }
  if (!/deepLinkLoadId/.test(dispatch)) {
    fail("DispatchPage must accept deepLinkLoadId prop");
  }
  if (!/pathLoadId/.test(dispatch) || !/pinnedLoadId/.test(dispatch)) {
    fail("DispatchPage must pathname-fallback + pin deep-link load id until Close");
  }
  if (!/routeLoadId = deepLinkLoadId \?\? routeParamLoadId \?\? pathLoadId/.test(dispatch)) {
    fail("DispatchPage must resolve loadId: deepLinkLoadId ?? useParams ?? pathname");
  }
  if (!/createPortal/.test(drawer) || !/document\.body/.test(drawer)) {
    fail("LoadDetailDrawer must createPortal(..., document.body) so fixed panel is not clipped");
  }
  if (!/data-testid=["']load-detail-drawer["']/.test(drawer)) {
    fail("LoadDetailDrawer must expose data-testid=load-detail-drawer when open");
  }
  if (!/export const loadRefParamSchema/.test(loadRef) || !/export function loadRefMatchSql/.test(loadRef)) {
    fail("apps/backend/src/lib/load-ref.ts must export loadRefParamSchema + loadRefMatchSql");
  }
  if (!/loadRefParamSchema/.test(mdataLoads) || !/loadRefMatchSql\("l", 1\)/.test(mdataLoads)) {
    fail("GET /api/v1/mdata/loads/:id must use loadRefParamSchema + loadRefMatchSql (UUID or load_number)");
  }
  if (!/loadRefParamSchema/.test(dispatchLoads) || !/loadRefMatchSql\("l", 1\)/.test(dispatchLoads)) {
    fail("GET /api/v1/dispatch/loads/:id must use loadRefParamSchema + loadRefMatchSql (UUID or load_number)");
  }
  // Mutations must remain UUID-only (do not loosen PATCH / transition).
  if (!/dispatchLoadIdParamsSchema = z\.object\(\{\s*id: z\.string\(\)\.uuid\(\)/.test(dispatchLoads)) {
    fail("dispatchLoadIdParamsSchema must stay UUID-only for mutations");
  }
  if (!/const loadIdParamSchema = z\.object\(\{ id: z\.string\(\)\.uuid\(\) \}\)/.test(mdataLoads)) {
    fail("mdata loadIdParamSchema must stay UUID-only for mutations");
  }
  console.log("OK verify-dispatch-load-deeplink-opens-drawer — portal + pin + load_number GET ref");
}

function selftest() {
  const bad = "return <DispatchPage loadsDeepLink />";
  let failed = false;
  const orig = process.exit;
  process.exit = (c) => {
    failed = c === 1;
    throw new Error("exit");
  };
  try {
    if (!/deepLinkLoadId=\{id\}/.test(bad)) fail("selftest-bad");
  } catch {
    /* expected */
  }
  process.exit = orig;
  if (!failed) fail("selftest: missing deepLinkLoadId did not fail");
  console.log("OK verify-dispatch-load-deeplink-opens-drawer --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else main();
