#!/usr/bin/env node
/**
 * LV-DISPATCH-LOAD-DEEPLINK-DRAWER
 * /dispatch/loads/:id must open LoadDetailDrawer (Devin Live FAIL: board-only after WO load click).
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

  if (!/deepLinkLoadId=\{id\}/.test(manifest) && !/deepLinkLoadId=\{id\}/.test(manifest.replace(/\s/g, ""))) {
    // allow multiline
    if (!/DispatchPage[\s\S]{0,80}deepLinkLoadId=\{id\}/.test(manifest)) {
      fail("DispatchLoadDetailRoute must pass deepLinkLoadId={id} to DispatchPage");
    }
  }
  if (!/deepLinkLoadId/.test(dispatch)) {
    fail("DispatchPage must accept deepLinkLoadId prop");
  }
  if (!/routeLoadId = deepLinkLoadId \?\? routeParamLoadId/.test(dispatch)) {
    fail("DispatchPage must prefer deepLinkLoadId over useParams for loadId");
  }
  if (!/data-testid=["']load-detail-drawer["']/.test(drawer)) {
    fail("LoadDetailDrawer must expose data-testid=load-detail-drawer when open");
  }
  console.log("OK verify-dispatch-load-deeplink-opens-drawer — deepLinkLoadId + drawer testid");
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
