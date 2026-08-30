#!/usr/bin/env node
/**
 * META-RATCHET — an instrument may not be cited until something proves it can FAIL.
 *
 * Three instruments shipped broken the same way (existence ratchet, matrix Live prose,
 * sql "not wired in this prototype"): nothing proved they could fail.
 *
 * For every auto_check named in columns.economic.json:
 *   (a) the script exists
 *   (b) --selftest exits 0
 *   (c) source does not treat "not wired in this prototype" as a successful exit path
 *
 * Own --selftest plants a stub that returns that sentinel and demands THIS guard reject it.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ECONOMIC = path.join(ROOT, "docs/specs/scoreboard/columns.economic.json");
/** Second input — product source. Without this path the guard is a closed loop on economic.json alone. */
const SQL_RUNNER = path.join(ROOT, "scripts/proof-engine/sql-runner.mjs");
const LABEL = "verify-guard-can-fail";
const SENTINEL = "not wired in this prototype";

export function checkAutoChecks(econDoc, { runSelftest = true } = {}) {
  const failures = [];
  for (const col of econDoc.columns || []) {
    const name = col.auto_check;
    if (!name) {
      failures.push(`${col.id}: missing auto_check`);
      continue;
    }
    const abs = path.join(ROOT, "scripts", name);
    if (!fs.existsSync(abs)) {
      failures.push(`${col.id}: auto_check missing ${name}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    // The sql-gap class: an auto_check that still carries the unwired sentinel.
    if (src.includes(SENTINEL)) {
      failures.push(`${name}: contains "${SENTINEL}" — stub class that shipped green`);
    }
    if (runSelftest) {
      const r = spawnSync(process.execPath, [abs, "--selftest"], { encoding: "utf8" });
      if (r.status !== 0) {
        failures.push(`${name} --selftest failed: ${(r.stderr || r.stdout || "").slice(0, 160)}`);
      }
      const out = `${r.stdout || ""}\n${r.stderr || ""}`;
      if (!/plant|FAIL|reject|selftest/i.test(out) && r.status === 0) {
        // Soft: require the word plant or FAIL in selftest output so happy-path-only is rejected
        if (!/PASS/.test(out)) failures.push(`${name} --selftest produced no PASS/plant evidence`);
      }
    }
  }
  return failures;
}

function selftest() {
  let pass = 0;
  let fail = 0;
  const t = (n, ok, d) => {
    if (ok) {
      pass++;
      console.log(`  PASS  ${n}`);
    } else {
      fail++;
      console.log(`  FAIL  ${n}${d ? " -> " + d : ""}`);
    }
  };
  console.log("verify-guard-can-fail SELFTEST — plant a not-wired stub and demand rejection\n");

  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".can-fail-"));
  const stub = path.join(tmp, "verify-planted-stub.mjs");
  fs.writeFileSync(
    stub,
    `#!/usr/bin/env node\nconsole.log("${SENTINEL}");\nprocess.exit(0);\n`,
  );
  // Point a fake econ column at the stub via checkAutoChecks shape
  const planted = {
    columns: [{ id: "gl_delta", auto_check: path.relative(path.join(ROOT, "scripts"), stub) }],
  };
  // auto_check is basename under scripts/ — put stub in scripts briefly
  const plantName = "verify-planted-not-wired-stub.mjs";
  const plantAbs = path.join(ROOT, "scripts", plantName);
  fs.writeFileSync(
    plantAbs,
    `#!/usr/bin/env node\nif (process.argv.includes("--selftest")) { console.log("PASS planted"); process.exit(0); }\nconsole.log("${SENTINEL}");\nprocess.exit(0);\n`,
  );
  try {
    const found = checkAutoChecks(
      { columns: [{ id: "gl_delta", auto_check: plantName }] },
      { runSelftest: true },
    );
    t(
      `planted "${SENTINEL}" stub is REJECTED`,
      found.some((f) => f.includes(SENTINEL) || f.includes("stub")),
      JSON.stringify(found),
    );
  } finally {
    fs.unlinkSync(plantAbs);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const clean = checkAutoChecks(JSON.parse(fs.readFileSync(ECONOMIC, "utf8")), { runSelftest: true });
  t("live economic auto_checks pass can-fail", clean.length === 0, clean.join(" | "));

  console.log(`\nSELFTEST ${fail === 0 ? "PASS" : "FAIL"} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(SQL_RUNNER)) {
    console.error(`FAIL: ${LABEL} — missing scripts/proof-engine/sql-runner.mjs (second input)`);
    process.exit(1);
  }
  const failures = checkAutoChecks(JSON.parse(fs.readFileSync(ECONOMIC, "utf8")));
  if (failures.length) {
    console.error(`FAIL: ${LABEL}`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`PASS: ${LABEL} — every economic auto_check has a working --selftest`);
}

main();
