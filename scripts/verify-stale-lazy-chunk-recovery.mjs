#!/usr/bin/env node
/**
 * @matrix-built [{"module":"drivers","leafRe":"^(profiles\.list|profiles\.detail)$","cols":["qbo_chrome","connectivity"]},{"module":"customers","leafRe":"^(md\.customer_details|customers\.modal\.customer_drill)$","cols":["qbo_chrome","connectivity"]}]
 * FINDING: DRIVERS-CHUNK-404-CRASH / CUSTOMER-DETAIL-LAZY-TABS-DEAD-SWITCH / WIZ-40
 *
 * WIZ-40: a new deploy must NEVER auto-reload. The owner books real loads for hours;
 * a mid-form reload destroys typed work. Notify a banner; queue it while a blocking modal is open.
 */
import fs from "node:fs";

const mainPath = "apps/frontend/src/main.tsx";
const recoveryPath = "apps/frontend/src/bootstrap/installStaleChunkRecovery.ts";
const bannerPath = "apps/frontend/src/components/StaleDeployBanner.tsx";
const modalPath = "apps/frontend/src/components/Modal.tsx";
const wizardPath = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

const main = fs.readFileSync(mainPath, "utf8");
const recovery = fs.readFileSync(recoveryPath, "utf8");
const banner = fs.readFileSync(bannerPath, "utf8");
const modal = fs.readFileSync(modalPath, "utf8");
const wizard = fs.readFileSync(wizardPath, "utf8");

const checks = [
  [main.includes('import { installStaleChunkRecovery } from "./bootstrap/installStaleChunkRecovery"'), "bootstrap import"],
  [/installStaleChunkRecovery\(\)/.test(main), "bootstrap invocation"],
  [/StaleDeployBanner/.test(main), "stale-deploy banner mounted"],
  [/addEventListener\(["']vite:preloadError["']/.test(recovery), "Vite preload failure listener"],
  [/event\.preventDefault\(\)/.test(recovery), "Vite default rejection suppression"],
  [/ih35:stale-deploy/.test(recovery) || /STALE_DEPLOY_EVENT/.test(recovery), "stale-deploy event"],
  [!/location\.reload\(/.test(recovery), "recovery must never auto-reload"],
  [/A new version is available/.test(banner), "banner copy"],
  [/querySelector\("\[data-ih35-blocking-modal\]"\)/.test(banner), "banner waits on blocking modal"],
  [!/setInterval\([\s\S]{0,200}location\.reload/.test(banner), "banner must not interval-reload"],
  [/onClick=\{\(\) => window\.location\.reload\(\)\}/.test(banner), "reload only on the Reload button"],
  [/data-ih35-blocking-modal="true"/.test(modal), "shared Modal marks blocking"],
  [/data-ih35-blocking-modal="true"/.test(wizard), "Book Load marks blocking"],
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
    recovery.replace("notifyStaleDeploy();", "window.location.reload();"),
    banner.replace("A new version is available — Reload.", "Please wait"),
    banner.replace('querySelector("[data-ih35-blocking-modal]")', 'querySelector("[data-other]")'),
  ];
  const detectors = [
    (source) => /addEventListener\(["']vite:preloadError["']/.test(source),
    (source) => /event\.preventDefault\(\)/.test(source),
    (source) => !/location\.reload\(/.test(source),
    (source) => /A new version is available/.test(source),
    (source) => /querySelector\("\[data-ih35-blocking-modal\]"\)/.test(source),
  ];
  const survivors = mutations.filter((source, index) => detectors[index](source));
  if (survivors.length) {
    console.error(`FAIL stale lazy-chunk recovery selftest: ${survivors.length} mutation(s) survived`);
    process.exit(1);
  }
  console.log("PASS stale lazy-chunk recovery selftest: 5/5 mutations rejected");
}

console.log("PASS stale lazy-chunk recovery: notify + queued banner, never auto-reload");
