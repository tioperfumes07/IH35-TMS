#!/usr/bin/env node
/**
 * LV-DISPATCH-LOAD-DEEPLINK-DRAWER / LV-WO-LOAD-DRAWER-PORTAL
 * /dispatch/loads/:id must open LoadDetailDrawer (Devin Live FAIL: board-only after WO load click).
 * Harden: pathname fallback + pinned id + createPortal to document.body.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const DISPATCH = path.join(ROOT, "apps/frontend/src/pages/Dispatch.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");

function fail(msg) {
  console.error(`FAIL verify-dispatch-load-deeplink-opens-drawer: ${msg}`);
  process.exit(1);
}

function main() {
  const manifest = fs.readFileSync(MANIFEST, "utf8");
  const dispatch = fs.readFileSync(DISPATCH, "utf8");
  const drawer = fs.readFileSync(DRAWER, "utf8");

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
  console.log("OK verify-dispatch-load-deeplink-opens-drawer — portal + pin + pathname fallback");
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
