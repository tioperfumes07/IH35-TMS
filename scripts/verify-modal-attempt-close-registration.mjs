#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety","fuel"],"cols":["qbo_chrome","connectivity"],"leaves":["safety.modal.*","fuel.modal.*"],"task":"CLASS-F6859-MODAL-REGISTER-CLOSE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";

const ROOT = "apps/frontend/src";

function filesBelow(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

function inspect(entries) {
  return entries.flatMap(({ file, source }) => {
    const direct = [...source.matchAll(/onRegisterAttemptClose=\{(set[A-Z][A-Za-z0-9]*)\}/g)];
    return direct.map((match) => `${file}: passes ${match[1]} directly; React executes the close function as a state updater`);
  });
}

const entries = filesBelow(ROOT).map((file) => ({ file, source: fs.readFileSync(file, "utf8") }));

if (process.argv.includes("--selftest")) {
  const planted = [{ file: "planted.tsx", source: "<Modal onRegisterAttemptClose={setAttemptClose} />" }];
  if (inspect(planted).length !== 1 || inspect(entries).length !== 0) {
    console.error("verify-modal-attempt-close-registration SELFTEST FAIL");
    process.exit(1);
  }
  console.log("verify-modal-attempt-close-registration selftest PASS — direct setter mutation rejected");
  process.exit(0);
}

const failures = inspect(entries);
if (failures.length) {
  console.error(`verify-modal-attempt-close-registration FAIL:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-modal-attempt-close-registration PASS — close functions are stored without React updater execution");
