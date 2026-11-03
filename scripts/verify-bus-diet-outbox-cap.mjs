#!/usr/bin/env node
/**
 * BUS-DIET-LAW Rule 1 + Rule 3 caps on hot bus files (not archive/).
 * OUTBOX ≤ 200 · INBOX ≤ 40 (except INBOX-*-SYNC-LAW*).
 *
 * Seat scope (ENG-34 / Cursor): `--seat=cursor` (or SEAT=cursor) only checks
 * OUTBOX-CURSOR.md + INBOX-CURSOR.md so CI can lock the Cursor diet while other
 * seats' hot bus remains over cap (not Cursor-owned to diet). Unscoped default
 * still audits every hot OUTBOX-/INBOX- file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUS = join(ROOT, "docs/bus");
const OUTBOX_CAP = 200;
const INBOX_CAP = 40;
const LABEL = "verify-bus-diet-outbox-cap";

function seatFromArgv(argv = process.argv) {
  const flag = argv.find((a) => a.startsWith("--seat="));
  if (flag) return flag.slice("--seat=".length).toLowerCase();
  if (process.env.SEAT) return String(process.env.SEAT).toLowerCase();
  return null;
}

function seatAllows(name, seat) {
  if (!seat) return true;
  const upper = seat.toUpperCase();
  return name === `OUTBOX-${upper}.md` || name === `INBOX-${upper}.md`;
}

function wcLines(text) {
  if (text.length === 0) return 0;
  const parts = text.split("\n");
  return text.endsWith("\n") ? parts.length - 1 : parts.length;
}

function collectFailures(names, readText, seat) {
  const failures = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    if (!seatAllows(name, seat)) continue;
    const wc = wcLines(readText(name));
    if (name.startsWith("OUTBOX-") && wc > OUTBOX_CAP) {
      failures.push(`${name}: ${wc} > OUTBOX_CAP ${OUTBOX_CAP}`);
    }
    if (name.startsWith("INBOX-") && !name.includes("SYNC-LAW") && wc > INBOX_CAP) {
      failures.push(`${name}: ${wc} > INBOX_CAP ${INBOX_CAP}`);
    }
  }
  return failures;
}

function selftest() {
  const cases = [
    [
      "cursor seat ignores other-seat overages",
      collectFailures(
        ["OUTBOX-CURSOR.md", "OUTBOX-CODEX.md", "INBOX-CURSOR.md", "INBOX-CC-1.md"],
        (n) => (n.includes("CODEX") || n.includes("CC-1") ? "x\n".repeat(300) : "ok\n"),
        "cursor",
      ).length === 0,
    ],
    [
      "cursor seat fails when OUTBOX-CURSOR over cap",
      collectFailures(
        ["OUTBOX-CURSOR.md", "OUTBOX-CODEX.md"],
        (n) => (n === "OUTBOX-CURSOR.md" ? "x\n".repeat(201) : "ok\n"),
        "cursor",
      ).some((f) => f.startsWith("OUTBOX-CURSOR.md:")),
    ],
    [
      "cursor seat fails when INBOX-CURSOR over cap",
      collectFailures(
        ["INBOX-CURSOR.md", "INBOX-CC-1.md"],
        (n) => (n === "INBOX-CURSOR.md" ? "x\n".repeat(41) : "ok\n"),
        "cursor",
      ).some((f) => f.startsWith("INBOX-CURSOR.md:")),
    ],
    [
      "unscoped still sees Codex overage",
      collectFailures(
        ["OUTBOX-CURSOR.md", "OUTBOX-CODEX.md"],
        (n) => (n === "OUTBOX-CODEX.md" ? "x\n".repeat(201) : "ok\n"),
        null,
      ).some((f) => f.startsWith("OUTBOX-CODEX.md:")),
    ],
    [
      "SYNC-LAW inbox exempt from cap",
      collectFailures(
        ["INBOX-SYNC-LAW.md"],
        () => "x\n".repeat(100),
        null,
      ).length === 0,
    ],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  if (bad) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const seat = seatFromArgv();
const names = readdirSync(BUS);
const failures = collectFailures(
  names,
  (name) => readFileSync(join(BUS, name), "utf8"),
  seat,
);

if (failures.length) {
  console.error(`${LABEL} FAIL${seat ? ` seat=${seat}` : ""}`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  `${LABEL} PASS${seat ? ` seat=${seat}` : ""} outbox≤${OUTBOX_CAP} inbox≤${INBOX_CAP}`,
);
