#!/usr/bin/env node
// Enforce CodeQL findings from the SARIF on disk, because the Security-tab upload is unavailable.
//
// WHY: publishing SARIF is a GitHub Advanced Security feature. GHAS is free on public repositories
// and licensed on private ones, so when this repo went private on 2026-08-06 the upload began
// returning 403 "Code scanning is not enabled for this repository" and failed the job — while the
// scan itself was perfectly healthy (4,639 TS + 4,242 JS files analysed, zero findings).
//
// Losing the upload must not mean losing the CHECK. `continue-on-error` would have produced a green
// badge that verified nothing, which is exactly the fake-green this repo's rules forbid. Instead the
// analysis still runs in full and this reads its output directly, failing the build on real findings.
//
// Fails on results whose effective severity is error (CodeQL's default failure bar, matching what
// code-scanning would surface as an alert). Warnings and notes are printed, not fatal.
//
// SUPPRESSIONS (CI-F03b, 2026-08-06): SARIF carries a standard `result.suppressions` array, which is
// how CodeQL represents an in-source `// codeql[rule-id]` comment. This script used to ignore it and
// count every result, which meant the repo had NO supported way to mark a false positive — the only
// way to clear one was to change the flagged code. That is a dangerous incentive when the finding sits
// on a security control: js/user-controlled-bypass fires on the OAuth callback's
// `parsedState.state !== storedState`, which IS the CSRF check, and "fixing" it would break login.
// Suppressed results are now honoured AND PRINTED — never silently dropped — so a suppression is an
// auditable statement in the log rather than an invisible hole.
//
// --selftest proves it can go red: a synthetic SARIF with one error-level result must exit 1, and the
// same file with that result removed must exit 0.

import fs from "node:fs";
import path from "node:path";

const LABEL = "ci-codeql-enforce-sarif";

/**
 * True when the result carries an accepted in-source suppression (a `// codeql[rule-id]` comment).
 * Only `inSource` counts: an `external` suppression would live outside the repo and could not be
 * reviewed in a diff.
 */
function suppressionOf(result) {
  const list = Array.isArray(result.suppressions) ? result.suppressions : [];
  return list.find(
    (s) => (s.kind === "inSource" || s.kind === undefined) && (s.status === undefined || s.status === "accepted")
  );
}

function severityOf(result, rulesById) {
  // SARIF precedence: result.level, then the rule's defaultConfiguration.level, then "warning".
  if (result.level) return result.level;
  const ruleId = result.ruleId || result.rule?.id;
  const rule = ruleId ? rulesById.get(ruleId) : undefined;
  return rule?.defaultConfiguration?.level || "warning";
}

function analyze(sarifPath) {
  const sarif = JSON.parse(fs.readFileSync(sarifPath, "utf8"));
  const findings = [];
  let total = 0;
  for (const run of sarif.runs || []) {
    const rulesById = new Map();
    for (const r of run.tool?.driver?.rules || []) rulesById.set(r.id, r);
    for (const ext of run.tool?.extensions || []) {
      for (const r of ext.rules || []) rulesById.set(r.id, r);
    }
    for (const result of run.results || []) {
      total++;
      const level = severityOf(result, rulesById);
      const suppression = suppressionOf(result);
      const loc = result.locations?.[0]?.physicalLocation;
      findings.push({
        level,
        suppressed: Boolean(suppression),
        justification: suppression?.justification || "",
        ruleId: result.ruleId || result.rule?.id || "(unknown rule)",
        message: (result.message?.text || "").split("\n")[0],
        file: loc?.artifactLocation?.uri || "(no location)",
        line: loc?.region?.startLine ?? 0,
      });
    }
  }
  return { total, findings };
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "sarifsel-"));
  const withError = {
    runs: [
      {
        tool: { driver: { rules: [{ id: "js/sql-injection", defaultConfiguration: { level: "error" } }] } },
        results: [
          {
            ruleId: "js/sql-injection",
            message: { text: "planted finding" },
            locations: [
              { physicalLocation: { artifactLocation: { uri: "a.ts" }, region: { startLine: 7 } } },
            ],
          },
        ],
      },
    ],
  };
  const p1 = path.join(tmp, "bad.sarif");
  fs.writeFileSync(p1, JSON.stringify(withError));
  const bad = analyze(p1);
  const badErrors = bad.findings.filter((f) => f.level === "error");
  if (badErrors.length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — planted error-level finding not detected`);
    process.exit(1);
  }
  const p2 = path.join(tmp, "clean.sarif");
  fs.writeFileSync(p2, JSON.stringify({ runs: [{ tool: { driver: { rules: [] } }, results: [] }] }));
  const clean = analyze(p2);
  if (clean.findings.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean SARIF reported findings`);
    process.exit(1);
  }
  // An in-source suppression must clear the SAME planted finding — and must be reported as suppressed,
  // not dropped. Without this the repo has no way to mark a false positive except editing the code.
  const withSuppressed = JSON.parse(JSON.stringify(withError));
  withSuppressed.runs[0].results[0].suppressions = [
    { kind: "inSource", status: "accepted", justification: "reviewed false positive" },
  ];
  const p3 = path.join(tmp, "suppressed.sarif");
  fs.writeFileSync(p3, JSON.stringify(withSuppressed));
  const sup = analyze(p3);
  const supErrors = sup.findings.filter((f) => f.level === "error" && !f.suppressed);
  if (supErrors.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — in-source suppression did not clear the finding`);
    process.exit(1);
  }
  if (sup.findings.filter((f) => f.suppressed).length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — suppressed finding was dropped instead of reported`);
    process.exit(1);
  }
  // A suppression the tool REJECTED must NOT clear the finding.
  const rejected = JSON.parse(JSON.stringify(withError));
  rejected.runs[0].results[0].suppressions = [{ kind: "inSource", status: "rejected" }];
  const p4 = path.join(tmp, "rejected.sarif");
  fs.writeFileSync(p4, JSON.stringify(rejected));
  if (analyze(p4).findings.filter((f) => f.level === "error" && !f.suppressed).length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — a REJECTED suppression wrongly cleared the finding`);
    process.exit(1);
  }
  // An EXTERNAL suppression lives outside the repo and cannot be reviewed in a diff — must not clear.
  const external = JSON.parse(JSON.stringify(withError));
  external.runs[0].results[0].suppressions = [{ kind: "external", status: "accepted" }];
  const p5 = path.join(tmp, "external.sarif");
  fs.writeFileSync(p5, JSON.stringify(external));
  if (analyze(p5).findings.filter((f) => f.level === "error" && !f.suppressed).length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — an EXTERNAL suppression wrongly cleared the finding`);
    process.exit(1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${LABEL}: selftest PASS — RED on a planted error-level finding, GREEN on a clean SARIF, ` +
    `in-source suppression clears + is reported, rejected/external suppressions do NOT clear.`);
  process.exit(0);
}

const dir = process.argv[2];
if (!dir) {
  console.error(`${LABEL}: usage: ${path.basename(process.argv[1])} <sarif-output-dir>`);
  process.exit(2);
}
if (!fs.existsSync(dir)) {
  // Refuse to pass silently: a missing output directory means the analysis did not produce results,
  // which is indistinguishable from "the check did not run" and must not read as success.
  console.error(`${LABEL} FAILED — no SARIF output at ${dir}. The analysis produced nothing to check.`);
  process.exit(1);
}
const sarifs = fs.readdirSync(dir).filter((f) => f.endsWith(".sarif"));
if (sarifs.length === 0) {
  console.error(`${LABEL} FAILED — ${dir} contains no .sarif file. Nothing was verified.`);
  process.exit(1);
}

let errors = 0;
let warnings = 0;
let suppressed = 0;
let scanned = 0;
for (const f of sarifs) {
  const { total, findings } = analyze(path.join(dir, f));
  scanned += total;
  for (const x of findings) {
    const line = `  [${x.level}] ${x.ruleId} — ${x.file}:${x.line} — ${x.message}`;
    if (x.suppressed) {
      // PRINTED, never silent: a suppression must be as visible in the log as the finding it clears,
      // so reviewing "what are we ignoring?" is reading the output, not auditing the source tree.
      suppressed++;
      console.log(`  [suppressed:${x.level}] ${x.ruleId} — ${x.file}:${x.line} — ${x.message}` +
        (x.justification ? `\n      justification: ${x.justification}` : ""));
    } else if (x.level === "error") {
      errors++;
      console.error(line);
    } else {
      warnings++;
      console.log(line);
    }
  }
}

if (errors > 0) {
  console.error(
    `\n${LABEL} FAILED — ${errors} error-level CodeQL finding(s) across ${sarifs.length} SARIF file(s).`
  );
  process.exit(1);
}
console.log(
  `${LABEL} OK — ${sarifs.length} SARIF file(s), ${scanned} result(s), 0 unsuppressed error-level ` +
    `findings (${warnings} warning/note, ${suppressed} suppressed in-source).`
);
