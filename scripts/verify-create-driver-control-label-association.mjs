#!/usr/bin/env node
/** DRIVER-F6470 — generated CreateDriver labels target their actual controls. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/frontend/src/components/drivers/CreateDriverModal.tsx");

function errors(source) {
  const result = [];
  const sections = source.match(/\.map\(\(\[key, label\]\) => \([\s\S]*?\n\s*\)\)\}/g) ?? [];
  const governed = sections.filter((section) => section.includes("<DatePicker"));
  if (governed.length !== 4) result.push(`expected 4 generated DatePicker sections, found ${governed.length}`);
  governed.forEach((section, index) => {
    if (!section.includes("<label htmlFor={key}")) result.push(`section ${index + 1} label lacks htmlFor`);
    if (!/<DatePicker\s+[\s\S]*?id=\{key\}/.test(section)) result.push(`section ${index + 1} DatePicker lacks matching id`);
    if (!/<input\s+[\s\S]*?id=\{key\}/.test(section)) result.push(`section ${index + 1} input lacks matching id`);
  });
  return result;
}
function run() {
  const found = errors(fs.readFileSync(FILE, "utf8"));
  if (found.length) { console.error("verify-create-driver-control-label-association FAIL:"); found.forEach((e) => console.error(" -", e)); process.exit(1); }
  console.log("verify-create-driver-control-label-association OK — 4 generated creator sections label their controls");
}
function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  try {
    const planted = original.replace("<label htmlFor={key}", "<label data-orphaned={key}");
    fs.writeFileSync(FILE, planted);
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (red.status === 0) throw new Error("orphaned label did not redden guard");
  } finally { fs.writeFileSync(FILE, original); }
  console.log("verify-create-driver-control-label-association --selftest PASS — orphaned label reddened guard");
}
if (process.argv.includes("--selftest")) selftest(); else run();
