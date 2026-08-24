#!/usr/bin/env node
/**
 * @matrix-built [{"module":"drivers","leafRe":"^(profiles\.list|profiles\.detail)$","cols":["qbo_chrome","connectivity"]},{"module":"customers","leafRe":"^(md\.customer_details|customers\.modal\.customer_drill)$","cols":["qbo_chrome","connectivity"]}]
 * FINDING: DRIVERS-CHUNK-404-CRASH / CUSTOMER-DETAIL-LAZY-TABS-DEAD-SWITCH
 */
import fs from "node:fs";

const mainPath = "apps/frontend/src/main.tsx";
const recoveryPath = "apps/frontend/src/bootstrap/installStaleChunkRecovery.ts";
const main = fs.readFileSync(mainPath, "utf8");
const recovery = fs.readFileSync(recoveryPath, "utf8");

const checks = [
  [main.includes('import { installStaleChunkRecovery } from "./bootstrap/installStaleChunkRecovery"'), "bootstrap import"],
  [/installStaleChunkRecovery\(\)/.test(main), "bootstrap invocation"],
  [/addEventListener\(["']vite:preloadError["']/.test(recovery), "Vite preload failure listener"],
  [/event\.preventDefault\(\)/.test(recovery), "Vite default rejection suppression"],
  [/sessionStorage\.getItem\(STALE_CHUNK_RELOAD_KEY\)/.test(recovery), "reload-loop fuse read"],
  [/Date\.now\(\)\s*-\s*lastReloadAt\s*<\s*RELOAD_FUSE_MS/.test(recovery), "bounded reload fuse"],
  [/sessionStorage\.setItem\(STALE_CHUNK_RELOAD_KEY/.test(recovery), "reload timestamp write"],
  [/location\.reload\(\)/.test(recovery), "current shell reload"],
];

const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) {
  console.error(`FAIL stale lazy-chunk recovery: ${failed.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    recovery.replace('addEventListener("vite:preloadError"', 'addEventListener("vite:ignoredError"'),
    recovery.replace("event.preventDefault();", ""),
    recovery.replace("window.location.reload();", ""),
    recovery.replace("Date.now() - lastReloadAt < RELOAD_FUSE_MS", "false"),
  ];
  const detectors = [
    (source) => /addEventListener\(["']vite:preloadError["']/.test(source),
    (source) => /event\.preventDefault\(\)/.test(source),
    (source) => /location\.reload\(\)/.test(source),
    (source) => /Date\.now\(\)\s*-\s*lastReloadAt\s*<\s*RELOAD_FUSE_MS/.test(source),
  ];
  const survivors = mutations.filter((source, index) => detectors[index](source));
  if (survivors.length) {
    console.error(`FAIL stale lazy-chunk recovery selftest: ${survivors.length} mutation(s) survived`);
    process.exit(1);
  }
  console.log("PASS stale lazy-chunk recovery selftest: 4/4 mutations rejected");
}

console.log("PASS stale lazy-chunk recovery: failed deploy chunks reload once with a bounded fuse");
