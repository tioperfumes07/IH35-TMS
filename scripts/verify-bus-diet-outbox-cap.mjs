#!/usr/bin/env node
/**
 * BUS-DIET-LAW Rule 1 + Rule 3 caps on hot bus files (not archive/).
 * OUTBOX ≤ 200 · INBOX ≤ 40 (except INBOX-*-SYNC-LAW*).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUS = join(ROOT, "docs/bus");
const OUTBOX_CAP = 200;
const INBOX_CAP = 40;

function wcLines(path) {
  const text = readFileSync(path, "utf8");
  if (text.length === 0) return 0;
  const parts = text.split("\n");
  return text.endsWith("\n") ? parts.length - 1 : parts.length;
}

const failures = [];
for (const name of readdirSync(BUS)) {
  if (!name.endsWith(".md")) continue;
  const path = join(BUS, name);
  const wc = wcLines(path);
  if (name.startsWith("OUTBOX-") && wc > OUTBOX_CAP) {
    failures.push(`${name}: ${wc} > OUTBOX_CAP ${OUTBOX_CAP}`);
  }
  if (name.startsWith("INBOX-") && !name.includes("SYNC-LAW") && wc > INBOX_CAP) {
    failures.push(`${name}: ${wc} > INBOX_CAP ${INBOX_CAP}`);
  }
}

if (process.argv.includes("--selftest")) {
  // Cap logic: empty failures on current tree is the self-check after rotation.
  if (failures.length) {
    console.error("selftest FAIL — hot bus over cap");
    process.exit(1);
  }
  console.log("verify-bus-diet-outbox-cap --selftest PASS");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-bus-diet-outbox-cap FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`verify-bus-diet-outbox-cap PASS outbox≤${OUTBOX_CAP} inbox≤${INBOX_CAP}`);
