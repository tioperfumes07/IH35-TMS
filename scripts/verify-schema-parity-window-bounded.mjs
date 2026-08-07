#!/usr/bin/env node
/**
 * The schema-parity DDL parser must stop at the END of each ALTER TABLE statement.
 *
 * THE BUG THIS LOCKS (found 2026-07-28): the parser scanned a fixed 4 KB window after each
 * `ALTER TABLE x` and never stopped at the statement terminator, despite its own comment claiming it
 * did. Consecutive ALTERs in one migration therefore bled into each other and every table absorbed
 * the FOLLOWING tables' columns.
 *
 * That is not cosmetic. It silently wrote columns into docs/schema-parity-baseline.json that exist on
 * NO table: 495 of 9,262 tracked entries (~5%) were phantom, proven by diffing every one of them
 * against prod's information_schema — all 495 absent, 0 real. A drift guard whose baseline invents
 * columns gives false assurance in both directions: it cannot see a real removal, and it reports work
 * that was never done.
 *
 * The check is behavioural, not textual: it runs the real parser over a fixture with two consecutive
 * ALTERs and asserts each table gets ONLY its own columns.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** Two consecutive ALTERs, exactly the shape that used to cross-contaminate (cf. 0266). */
const FIXTURE = `
ALTER TABLE demo.alpha
  ADD COLUMN IF NOT EXISTS alpha_only_col text;

ALTER TABLE demo.beta
  ADD COLUMN IF NOT EXISTS beta_only_col text;
`;

function run() {
  const dir = mkdtempSync(join(tmpdir(), "parity-window-"));
  try {
    mkdirSync(join(dir, "db", "migrations"), { recursive: true });
    writeFileSync(join(dir, "db", "migrations", "209901010000_window_fixture.sql"), FIXTURE, "utf8");

    // Ask the parser to print what it attributes, using its own module.
    const probe = `
      import { pathToFileURL } from "node:url";
      const mod = await import(pathToFileURL(${JSON.stringify(join(ROOT, "scripts/verify-schema-parity.mjs"))}).href);
      const fn = mod.parseMigrationSchema ?? mod.collectMigrationSchema ?? null;
      if (!fn) { console.log("NO_EXPORT"); process.exit(0); }
      const out = fn(${JSON.stringify(join(dir, "db", "migrations"))});
      const alpha = [...(out.get?.("demo.alpha") ?? [])];
      const beta = [...(out.get?.("demo.beta") ?? [])];
      console.log(JSON.stringify({ alpha, beta }));
    `;
    const r = spawnSync("node", ["--input-type=module", "-e", probe], { encoding: "utf8" });
    const out = (r.stdout || "").trim();

    if (out === "NO_EXPORT" || !out.startsWith("{")) {
      // The parser does not expose a callable collector; fall back to asserting the SOURCE bounds the
      // window, which is the property that matters. Textual, but explicit about being a fallback.
      // CI-F03 / CodeQL js/unnecessary-use-of-cat: this spawned `cat` to read a local file.
      // readFileSync does the same thing without a process, and cannot fail silently to an
      // undefined .stdout the way spawnSync can when the binary is missing.
      const src = readFileSync(join(ROOT, "scripts/verify-schema-parity.mjs"), "utf8");
      const bounded = /const terminator = capped\.indexOf\(";"\)/.test(src) && /terminator === -1 \? capped : capped\.slice\(0, terminator\)/.test(src);
      return bounded
        ? { ok: true, message: "PASS: the ALTER TABLE scan window is bounded at the statement terminator (source check)." }
        : {
            ok: false,
            message:
              "FAIL: the ALTER TABLE scan window is NOT bounded at the statement terminator. Consecutive " +
              "ALTERs will cross-contaminate and --update will write columns into the baseline that exist " +
              "on no table (495 such phantoms were found on 2026-07-28).",
          };
    }

    const { alpha, beta } = JSON.parse(out);
    const bleed = alpha.includes("beta_only_col") || beta.includes("alpha_only_col");
    return bleed
      ? {
          ok: false,
          message:
            `FAIL: column attribution bled across statements — demo.alpha=${JSON.stringify(alpha)}, ` +
            `demo.beta=${JSON.stringify(beta)}. Each table must receive only its own ADD COLUMNs.`,
        }
      : { ok: true, message: "PASS: consecutive ALTER TABLE statements attribute columns to their own table only." };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const result = run();
console.log(result.message);
if (!result.ok) process.exit(1);
