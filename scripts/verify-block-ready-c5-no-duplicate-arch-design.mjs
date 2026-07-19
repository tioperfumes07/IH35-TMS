#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`verify:block-ready-c5-no-duplicate-arch-design FAIL: ${message}`);
  process.exit(1);
}

const verifyMetaPath = path.resolve(ROOT, "scripts/verify-meta.json");
if (!fs.existsSync(verifyMetaPath)) {
  fail("scripts/verify-meta.json missing");
}
const verifyMeta = JSON.parse(fs.readFileSync(verifyMetaPath, "utf8"));
const skipList = verifyMeta.block_ready_c5_skip_after_c4;
if (!Array.isArray(skipList) || !skipList.includes("verify:arch-design")) {
  fail('verify-meta.json must list "verify:arch-design" in block_ready_c5_skip_after_c4');
}
const orchList = verifyMeta.block_ready_c5_skip_orchestrators;
if (!Array.isArray(orchList) || !orchList.includes("verify:local-ci") || !orchList.includes("verify:static")) {
  fail('verify-meta.json must list "verify:local-ci" and "verify:static" in block_ready_c5_skip_orchestrators');
}

const blockReadyPath = path.resolve(ROOT, "scripts/block-ready.mjs");
const blockReadySrc = fs.readFileSync(blockReadyPath, "utf8");
if (!blockReadySrc.includes("block_ready_c5_skip_after_c4")) {
  fail("block-ready.mjs must read block_ready_c5_skip_after_c4 from verify-meta");
}
if (!blockReadySrc.includes("already run in C4")) {
  fail("block-ready.mjs runCheckC5 must skip C4-overlap scripts with (already run in C4) log");
}
if (!blockReadySrc.includes("shouldSkipC5VerifyScript") && !blockReadySrc.includes("getC5SkipReason")) {
  fail("block-ready.mjs must apply C5 skip via getC5SkipReason/shouldSkipC5VerifyScript in runCheckC5");
}
if (!blockReadySrc.includes("block_ready_c5_skip_orchestrators")) {
  fail("block-ready.mjs must read block_ready_c5_skip_orchestrators from verify-meta");
}

const precheckPath = path.resolve(ROOT, "scripts/branch-precheck-push.mjs");
const precheckSrc = fs.readFileSync(precheckPath, "utf8");
const buildMatch = precheckSrc.match(/export function buildPrecheckSteps[\s\S]*?^}/m);
if (!buildMatch) {
  fail("buildPrecheckSteps not found in branch-precheck-push.mjs");
}
const buildBody = buildMatch[0];
if (buildBody.includes("discoverVerifyScripts") || buildBody.includes('startsWith("verify:")')) {
  fail("buildPrecheckSteps must not enumerate verify:* scripts (build + block-ready only)");
}
if (!buildBody.includes("block-ready")) {
  fail("buildPrecheckSteps must include block-ready");
}

console.log("verify:block-ready-c5-no-duplicate-arch-design PASS");
