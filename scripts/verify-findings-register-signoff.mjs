#!/usr/bin/env node
/**
 * GUARD: the CC-3 findings register is COMPLETE and its sign-offs are HONEST.
 *
 * OWNER LAW 2026-08-07 (Jorge, verbatim): "create permanent rule that you will write all findings, create
 * list and checklist and each coder that works on it checks it once its done so I can also request your
 * list and you show it to me and I know the jobs were completed."
 *
 * Register: docs/audit/CC-3-FINDINGS-CHECKLIST.md — the single place the owner looks to see what is done.
 * Evidence + fix instructions live in docs/audit/GUARD-WORKORDERS.md; SIGN-OFF lives in the register.
 *
 * WHY A GUARD AND NOT A CONVENTION: a completion list nobody verifies degrades into a list of ticks. The
 * two ways it rots are (a) a defect gets filed on the board and never reaches the register, so the owner's
 * list silently under-reports the work; and (b) a box gets ticked with no PR, no date, no live proof — a
 * completion claim with nothing behind it. This fails the build on both.
 *
 * WHAT IT ENFORCES — deliberately narrow, so it cannot false-fail:
 *   CHECK 1  every finding id that OWNS a row in GUARD-WORKORDERS.md with status OPEN has a row here.
 *   CHECK 2  every row marked done (☑) carries a non-empty Coder, PR, Date, Live proof AND Guard cell.
 *   CHECK 3  no finding id appears twice as a checklist row (a duplicate hides one of them).
 *
 * NOT CLAIMED: this is a structural check. It proves the register is complete and that a tick carries its
 * evidence fields — it does NOT re-verify the fix itself. That is CC-3's independent VERIFIED stamp
 * (register rule clause 4), which is a live re-test, not something a static guard can do. A guard that
 * pretended to prove a fix works would be theater.
 *
 * Self-test: node scripts/verify-findings-register-signoff.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER = "docs/audit/CC-3-FINDINGS-CHECKLIST.md";
const BOARD = "docs/audit/GUARD-WORKORDERS.md";
const LABEL = "verify-findings-register-signoff";
const SELFTEST = process.argv.includes("--selftest");

const ID_RE = /`((?:LV|CI)-[A-Z0-9-]+)`/;

/** A board row whose SUBJECT is a finding id — `ID` immediately followed by an em-dash. */
export function boardOpenIds(boardText) {
  const ids = new Set();
  for (const line of boardText.split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue;
    const m = /`((?:LV|CI)-[A-Z0-9-]+)`\s*—/.exec(line);
    if (!m) continue; // a mere prose mention of another lane's card is not a row we own
    const status = line.replace(/\|\s*$/, "").split("|").pop() ?? "";
    if (/OPEN/i.test(status)) ids.add(m[1]);
  }
  return ids;
}

/**
 * Checklist rows: `| ☐ |` or `| ☑ |` followed by the id and the evidence cells.
 *
 * FENCED BLOCKS ARE SKIPPED. The register documents the sign-off format with a worked ☑ example inside a
 * ``` fence; counting that as a real completion made the guard report "1 signed off" while the scoreboard
 * honestly said 0. A register that over-reports completions is the exact failure this guard exists to
 * prevent, so the parser must not read documentation as data.
 */
export function registerRows(regText) {
  const rows = [];
  let inFence = false;
  for (const line of regText.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^\|\s*(☐|☑)\s*\|\s*(.+)$/.exec(line);
    if (!m) continue;
    const cells = m[2].replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    // cells: id, sev, lane, coder, pr, date, live proof, guard, verified
    // The id MUST come from cells[0] (this row's own id column), never from ID_RE.exec() against
    // the whole row text — a row whose real id has a different prefix (e.g. ACCT-F...) can still
    // legitimately mention an LV-/CI- id in its own PROSE (a cross-reference to another row, e.g.
    // "flagged on the existing LV-... OPEN row instead"); matching anywhere in the row text
    // wrongly adopts that prose mention as the row's id and manufactures a phantom duplicate
    // against the row that id really belongs to (LST-ORPH-04-FINDINGS-REGISTER-ID-MISPARSE).
    const id = ID_RE.exec(cells[0] ?? "");
    if (!id) continue;
    rows.push({ done: m[1] === "☑", id: id[1], cells });
  }
  return rows;
}

const EMPTY = (v) => !v || v === "—" || v === "-" || v === "";

export function audit(boardText, regText) {
  const problems = [];
  const rows = registerRows(regText);
  const seen = new Map();

  for (const r of rows) {
    // CHECK 3 — duplicates
    if (seen.has(r.id)) problems.push(`${r.id}: appears as a checklist row more than once — a duplicate hides one of them.`);
    seen.set(r.id, r);

    // CHECK 2 — a tick must carry its evidence
    if (r.done) {
      const [, , , coder, pr, date, proof, guard] = r.cells;
      const missing = [];
      if (EMPTY(coder)) missing.push("Coder");
      if (EMPTY(pr)) missing.push("PR");
      if (EMPTY(date)) missing.push("Date");
      if (EMPTY(proof)) missing.push("Live proof of fix");
      if (EMPTY(guard)) missing.push("Guard (file + step #)");
      if (missing.length) {
        problems.push(
          `${r.id}: marked DONE (☑) but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty. ` +
            `A tick with no evidence is a completion claim with nothing behind it — fill the cells or revert to ☐.`
        );
      }
    }
  }

  // CHECK 1 — every OPEN board finding is on the list the owner reads
  for (const id of boardOpenIds(boardText)) {
    if (!seen.has(id)) {
      problems.push(
        `${id}: OPEN in ${BOARD} but has NO row in ${REGISTER}. The owner's completion list would ` +
          `silently under-report this work. Add a \`| ☐ | \\\`${id}\\\` | … |\` row.`
      );
    }
  }
  return problems;
}

function run() {
  for (const f of [REGISTER, BOARD]) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      console.error(`${LABEL} — FAILED\n\nMissing ${f}. The findings register is owner-locked law (2026-08-07); it may not be deleted.`);
      return 1;
    }
  }
  const problems = audit(fs.readFileSync(path.join(ROOT, BOARD), "utf8"), fs.readFileSync(path.join(ROOT, REGISTER), "utf8"));
  if (problems.length) {
    console.error(`${LABEL} — FAILED\n`);
    for (const p of problems.slice(0, 40)) console.error(`  ✗ ${p}`);
    if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
    return 1;
  }
  const rows = registerRows(fs.readFileSync(path.join(ROOT, REGISTER), "utf8"));
  console.log(
    `${LABEL} OK — ${rows.length} findings registered, ${rows.filter((r) => r.done).length} signed off ` +
      `(every tick carries coder/PR/date/live-proof/guard; every OPEN board finding is listed)`
  );
  return 0;
}

function selftest() {
  const board = [
    "| **OPEN** `LV-AAA` — a real defect | — | C | **CC-1** | evidence | **OPEN** |",
    "| **OPEN** `LV-BBB` — another defect | — | C | **CC-2** | evidence | **OPEN** |",
    "| **DONE** `LV-CCC` — already closed | — | C | **CC-1** | evidence | **DONE** |",
    "| some row merely MENTIONING `CI-F03` in prose | — | C | **CC-1** | evidence | **OPEN** |",
  ].join("\n");

  const cases = [
    {
      name: "complete register passes",
      reg: "| ☐ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |\n| ☐ | `LV-BBB` | P1 | CC-2 | — | — | — | — | — | — |",
      expect: 0,
    },
    {
      name: "OPEN board finding missing from register is caught",
      reg: "| ☐ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |",
      expect: 1,
    },
    {
      name: "tick with no evidence is caught",
      reg: "| ☑ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |\n| ☐ | `LV-BBB` | P1 | CC-2 | — | — | — | — | — | — |",
      expect: 1,
    },
    {
      name: "fully-evidenced tick passes",
      reg:
        "| ☑ | `LV-AAA` | P0 | CC-1 | CC-1 | #1234 | 2026-08-09 | healthz sha abc1234 | verify-x.mjs (2705) | — |\n" +
        "| ☐ | `LV-BBB` | P1 | CC-2 | — | — | — | — | — | — |",
      expect: 0,
    },
    {
      name: "duplicate row is caught",
      reg:
        "| ☐ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |\n" +
        "| ☐ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |\n" +
        "| ☐ | `LV-BBB` | P1 | CC-2 | — | — | — | — | — | — |",
      expect: 1,
    },
    {
      name: "a prose-only mention of another lane's card is NOT demanded",
      reg: "| ☐ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |\n| ☐ | `LV-BBB` | P1 | CC-2 | — | — | — | — | — | — |",
      expect: 0, // CI-F03 owns no row (no `ID` — em-dash), so it must not be required
    },
    {
      name: "a ☑ example inside a ``` fence is NOT counted as a completion",
      reg:
        "| ☐ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |\n" +
        "| ☐ | `LV-BBB` | P1 | CC-2 | — | — | — | — | — | — |\n" +
        "```\n| ☑ | `LV-EXAMPLE-ID` | P0 | CC-1 | CC-1 | #1234 | 2026-08-09 | proof | guard |\n```",
      expect: 0, // documentation must never be read as data
    },
    {
      name: "a CLOSED board finding is not demanded",
      reg: "| ☐ | `LV-AAA` | P0 | CC-1 | — | — | — | — | — | — |\n| ☐ | `LV-BBB` | P1 | CC-2 | — | — | — | — | — | — |",
      expect: 0, // LV-CCC is DONE, so absence from the register is fine
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const got = audit(board, c.reg).length;
    const ok = got === c.expect;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"} — ${c.name} (expected ${c.expect} problem(s), got ${got})`);
  }
  if (failed) {
    console.error(`${LABEL} --selftest FAILED (${failed}/${cases.length})`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  return 0;
}

process.exit(SELFTEST ? selftest() : run());
